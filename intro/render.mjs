// Renders intro/index.html to an MP4, one frame at a time, then mixes the page's window.AUDIO cues:
// the voices on top, the song (if present) ducking under them.
// Needs the project served locally (python -m http.server 4601) and ffmpeg on PATH.
// usage: node intro/render.mjs [output.mp4]
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const FPS = 30, W = 1080, H = 1920, PORT = 9334;
const out = process.argv[2] || 'intro/sahil-shivam-intro.mp4';
const frames = mkdtempSync(join(tmpdir(), 'intro-frames-'));
const sleep = ms => new Promise(r => setTimeout(r, ms));

const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'intro-chrome-'))}`,
  `--window-size=${W},${H}`, '--hide-scrollbars', 'about:blank']);
let targets;
for (let i = 0; i < 50 && !targets; i++) { await sleep(200); targets = await fetch(`http://127.0.0.1:${PORT}/json`).then(r => r.json()).catch(() => null); }
const ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
await new Promise(r => ws.onopen = r);
let id = 0; const pending = new Map();
ws.onmessage = e => { const m = JSON.parse(e.data); pending.get(m.id)?.(m.result); pending.delete(m.id); };
const send = (method, params = {}) => new Promise(r => { pending.set(++id, r); ws.send(JSON.stringify({ id, method, params })); });
const run = async expression => (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result.value;

await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: 'http://localhost:4601/intro/' });
await sleep(1500);
await run('ready');
const duration = await run('DURATION'), total = Math.round(duration * FPS);
const audio = await run('window.AUDIO && JSON.parse(JSON.stringify(AUDIO))');

for (let i = 0; i < total; i++) {
  await run(`render(${i / FPS})`);
  const { data } = await send('Page.captureScreenshot', { format: 'jpeg', quality: 95 });
  writeFileSync(join(frames, `f${String(i).padStart(4, '0')}.jpg`), Buffer.from(data, 'base64'));
  if (i % 60 === 0) console.log(`frame ${i}/${total}`);
}
chrome.kill();

const silent = join(frames, 'video.mp4');
execFileSync('ffmpeg', ['-v', 'error', '-y', '-framerate', String(FPS), '-i', join(frames, 'f%04d.jpg'),
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', audio ? silent : out], { stdio: 'inherit' });

if (audio) {
  const voices = audio.voices || [], song = audio.song && existsSync(`intro/${audio.song.src}`) ? audio.song : null;
  if (audio.song && !song) console.log(`no intro/${audio.song.src}: mixing the voices only`);
  const args = ['-v', 'error', '-y', '-i', silent];
  voices.forEach(v => args.push('-ss', String(v.from), '-t', String(v.dur), '-i', `intro/${v.src}`));
  if (song) args.push('-ss', String(song.from), '-t', String(duration), '-i', `intro/${song.src}`);
  const f = voices.map((v, i) => `[${i + 1}:a]aformat=sample_rates=48000:channel_layouts=stereo,adelay=${Math.round(v.at * 1000)}:all=1,apad=whole_dur=${duration}[v${i}]`);
  f.push(`${voices.map((_, i) => `[v${i}]`).join('')}amix=inputs=${voices.length}:normalize=0:duration=longest,volume=1.5${song ? '[vo]' : '[a]'}`);
  // the song dips ~13 dB under each voice cue, a beat late so the downbeat under the cut still lands
  const under = voices.map(v => `clip(min((t-${v.at + .08})/0.18,(${v.at + v.dur + .1}-t)/0.45),0,1)`).reduce((a, w) => `max(${a},${w})`);
  if (song) f.push(`[${voices.length + 1}:a]aformat=sample_rates=48000:channel_layouts=stereo,volume=eval=frame:volume='${song.volume ?? 1}*(1-0.78*${under})',afade=t=in:d=0.4,afade=t=out:st=${duration - 1.6}:d=1.6[song]`,
    '[song][vo]amix=inputs=2:normalize=0:duration=first,alimiter=limit=0.95[a]');
  execFileSync('ffmpeg', [...args, '-filter_complex', f.join(';'), '-map', '0:v', '-map', '[a]',
    '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', out], { stdio: 'inherit' });
}
rmSync(frames, { recursive: true, force: true });
console.log(`wrote ${out}: ${total} frames, ${total / FPS}s`);
process.exit(0);
