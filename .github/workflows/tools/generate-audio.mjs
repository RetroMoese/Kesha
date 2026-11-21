// tools/generate-audio.mjs

/* Reads assets/audio/phrases.json and renders each phrase to assets/audio/<key>.mp3 via edge-tts.
   Fallback engine: piper (offline ONNX) -> wav -> optional ffmpeg mp3.
   Usage: node tools/generate-audio.mjs [--force] [--voice ru-RU-SvetlanaNeural] [--rate=-10%] [--engine piper] */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const AUDIO_DIR = join(ROOT, 'assets', 'audio');
const PHRASES_FILE = join(AUDIO_DIR, 'phrases.json');

function parseArgs(argv) {
  const out = { force: false, voice: 'ru-RU-DmitryNeural', rate: '+0%', engine: 'auto', model: 'ru_RU-dmitri-medium.onnx', only: null, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--force' || a === '-f') out.force = true;
    else if (a === '--dry-run') out.dryRun = true;
    else if (a === '--voice') out.voice = argv[++i];
    else if (a.startsWith('--voice=')) out.voice = a.split('=')[1];
    else if (a === '--rate') out.rate = argv[++i];
    else if (a.startsWith('--rate=')) out.rate = a.split('=')[1];
    else if (a === '--engine') out.engine = argv[++i];
    else if (a.startsWith('--engine=')) out.engine = a.split('=')[1];
    else if (a === '--model') out.model = argv[++i];
    else if (a.startsWith('--model=')) out.model = a.split('=')[1];
    else if (a === '--only') out.only = argv[++i].split(',').map(s => s.trim());
    else if (a.startsWith('--only=')) out.only = a.split('=')[1].split(',').map(s => s.trim());
  }
  return out;
}
function hasCli(cmd) {
  const probe = process.platform === 'win32' ? spawnSync('where', [cmd], { encoding: 'utf8' }) : spawnSync('which', [cmd], { encoding: 'utf8' });
  if (probe.status === 0 && probe.stdout.trim()) return true;
  return spawnSync(cmd, ['--version'], { encoding: 'utf8' }).status === 0;
}
const fileName = key => key.replace(/\./g, '-') + '.mp3';
function normalizeRate(rate) {
  if (!rate) return '+0%';
  if (/^[+-]\d+%$/.test(rate)) return rate;
  if (/^\d+%$/.test(rate)) return '+' + rate;
  if (/^[+-]?\d+$/.test(rate)) return (rate.startsWith('-') ? '' : '+') + rate + '%';
  return '+0%';
}
function renderEdge(phrase, outPath, args) {
  const cli = ['--voice', args.voice, '--rate=' + normalizeRate(phrase.rate || args.rate), '--text', phrase.text, '--write-media', outPath];
  if (args.dryRun) { console.log('edge-tts ' + cli.map(a => JSON.stringify(a)).join(' ')); return true; }
  const res = spawnSync('edge-tts', cli, { encoding: 'utf8', cwd: ROOT });
  if (res.status !== 0) { console.error('  edge-tts error:', (res.stderr || res.stdout || '').trim().split('\n').slice(0, 3).join(' | ')); return false; }
  return existsSync(outPath) && statSync(outPath).size > 0;
}
function renderPiper(phrase, outPath, args) {
  const wavPath = outPath.replace(/\.mp3$/, '.wav');
  const cli = ['--model', args.model, '--output_file', wavPath];
  if (args.dryRun) { console.log('echo ' + JSON.stringify(phrase.text) + ' | piper ' + cli.join(' ')); return true; }
  const res = spawnSync('piper', cli, { input: phrase.text, encoding: 'utf8', cwd: ROOT });
  if (res.status !== 0 || !existsSync(wavPath)) { console.error('  piper error:', (res.stderr || '').trim().split('\n').slice(0, 3).join(' | ')); return false; }
  if (!hasCli('ffmpeg')) { console.log('  ffmpeg not found — WAV kept: ' + wavPath); return true; }
  const conv = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', wavPath, '-codec:a', 'libmp3lame', '-qscale:a', '4', outPath], { encoding: 'utf8', cwd: ROOT });
  if (conv.status !== 0) { console.error('  ffmpeg failed, WAV kept'); return true; }
  return existsSync(outPath) && statSync(outPath).size > 0;
}
function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!existsSync(PHRASES_FILE)) { console.error('phrases.json not found: ' + PHRASES_FILE); process.exit(1); }
  mkdirSync(AUDIO_DIR, { recursive: true });
  let phrases;
  try { phrases = JSON.parse(readFileSync(PHRASES_FILE, 'utf8')); }
  catch (e) { console.error('phrases.json is not valid JSON:', e.message); process.exit(1); }
  if (!Array.isArray(phrases) || !phrases.length) { console.error('phrases.json must be a non-empty array'); process.exit(1); }
  if (args.only) phrases = phrases.filter(p => args.only.includes(p.key));
  const edgeOk = hasCli('edge-tts'), piperOk = hasCli('piper');
  let engine = args.engine;
  if (engine === 'auto') engine = edgeOk ? 'edge-tts' : (piperOk ? 'piper' : 'none');
  if (engine === 'edge-tts' && !edgeOk) engine = piperOk ? 'piper' : 'none';
  if (engine === 'piper' && !piperOk) engine = edgeOk ? 'edge-tts' : 'none';
  if (engine === 'none' && !args.dryRun) {
    console.error('No TTS CLI found.\nInstall one of:\n  pip install edge-tts\n  pip install piper-tts\nThen rerun: node tools/generate-audio.mjs');
    process.exit(1);
  }
  console.log('Kesha audio generator');
  console.log('  engine: ' + engine + (engine === 'edge-tts' ? ' (' + args.voice + ', rate ' + normalizeRate(args.rate) + ')' : engine === 'piper' ? ' (' + args.model + ')' : ''));
  console.log('  output: ' + AUDIO_DIR);
  console.log('  phrases: ' + phrases.length + (args.force ? ' [force overwrite]' : ''));
  console.log('');
  let generated = 0, skipped = 0, failed = 0;
  const manifest = {};
  phrases.forEach((phrase, i) => {
    const label = '[' + (i + 1) + '/' + phrases.length + '] ' + phrase.key;
    if (!phrase.key || !phrase.text) { console.warn(label + ' — invalid entry'); failed++; return; }
    const file = fileName(phrase.key);
    const outPath = join(AUDIO_DIR, file);
    manifest[phrase.key] = 'assets/audio/' + file;
    if (existsSync(outPath) && !args.force) { console.log(label + ' — exists, skipped'); skipped++; return; }
    process.stdout.write(label + ' — rendering… ');
    const ok = engine === 'edge-tts' ? renderEdge(phrase, outPath, args) : renderPiper(phrase, outPath, args);
    if (ok) { console.log('ok'); generated++; } else { console.log('FAILED'); failed++; }
  });
  writeFileSync(join(AUDIO_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  console.log('');
  console.log('Сгенерировано ' + generated + ' файлов, пропущено ' + skipped + (failed ? ', ошибок ' + failed : ''));
  console.log('Манифест: ' + join(AUDIO_DIR, 'manifest.json'));
  if (failed) process.exitCode = 2;
}
main();