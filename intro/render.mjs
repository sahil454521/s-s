// Renders intro/index.html to an MP4, one frame at a time.
// Needs the project served locally (python -m http.server 4601) and ffmpeg on PATH.
// usage: node intro/render.mjs [output.mp4]
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
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
const total = Math.round(await run('DURATION') * FPS);

for (let i = 0; i < total; i++) {
  await run(`render(${i / FPS})`);
  const { data } = await send('Page.captureScreenshot', { format: 'jpeg', quality: 95 });
  writeFileSync(join(frames, `f${String(i).padStart(4, '0')}.jpg`), Buffer.from(data, 'base64'));
  if (i % 60 === 0) console.log(`frame ${i}/${total}`);
}
chrome.kill();

execFileSync('ffmpeg', ['-v', 'error', '-y', '-framerate', String(FPS), '-i', join(frames, 'f%04d.jpg'),
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out], { stdio: 'inherit' });
rmSync(frames, { recursive: true, force: true });
console.log(`wrote ${out}: ${total} frames, ${total / FPS}s`);
process.exit(0);
