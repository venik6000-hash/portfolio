// Собирает презентационные картинки 16:9 для карточек проектов из сырых скриншотов.
//
//   node tools/mockup.mjs                  — все сцены из assets/projects/mockups.json
//   node tools/mockup.mjs <slug> [<slug>]  — только указанные сцены
//   node tools/mockup.mjs --list           — показать сцены и наличие сырых кадров
//
// Опции:
//   --config <file>   другой конфиг (по умолчанию assets/projects/mockups.json)
//   --out <dir>       куда писать <slug>.jpg (по умолчанию assets/projects)
//   --ss <n>          суперсэмплинг при съёмке, 1…3 (по умолчанию 2: снимаем 4480×2520 и уменьшаем)
//
// Сцена: { slug, device, angle, background, screen, phoneScreen?, url?, offsetY?, zoom?, … } —
// полный список параметров в шапке tools/mockup.html. Пути считаются от корня проекта.
// Сцены, у которых файла `screen` ещё нет, пропускаются с предупреждением.
import { chromium } from 'playwright-core';
import { spawnSync } from 'node:child_process';
import { createReadStream, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { homedir, tmpdir } from 'node:os';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const WIDTH = 2240;
const HEIGHT = 1260;
const QUALITY_MAX = 86;
const QUALITY_MIN = 78;
const TARGET_BYTES = 400 * 1024;

// ---------- аргументы ----------
const args = process.argv.slice(2);
const opts = { config: 'assets/projects/mockups.json', out: 'assets/projects', ss: 2, list: false };
const slugs = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--config') opts.config = args[++i];
  else if (a === '--out') opts.out = args[++i];
  else if (a === '--ss') opts.ss = Math.max(1, Math.min(3, Number(args[++i]) || 2));
  else if (a === '--list') opts.list = true;
  else if (a === '-h' || a === '--help') {
    console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').filter((l) => l.startsWith('//')).map((l) => l.slice(3)).join('\n'));
    process.exit(0);
  } else if (a.startsWith('--')) {
    console.error(`неизвестная опция ${a}`);
    process.exit(1);
  } else slugs.push(a);
}

const configPath = resolve(ROOT, opts.config);
const outDir = resolve(ROOT, opts.out);
if (!existsSync(configPath)) {
  console.error(`нет конфига: ${relative(ROOT, configPath)}`);
  process.exit(1);
}
let scenes;
try {
  const parsed = JSON.parse(readFileSync(configPath, 'utf8'));
  scenes = Array.isArray(parsed) ? parsed : parsed.scenes;
  if (!Array.isArray(scenes)) throw new Error('ожидается массив сцен');
} catch (e) {
  console.error(`не читается ${relative(ROOT, configPath)}: ${e.message}`);
  process.exit(1);
}
if (slugs.length) {
  const unknown = slugs.filter((s) => !scenes.some((sc) => sc.slug === s));
  if (unknown.length) {
    console.error(`нет таких сцен: ${unknown.join(', ')}. Есть: ${scenes.map((s) => s.slug).join(', ')}`);
    process.exit(1);
  }
  scenes = scenes.filter((s) => slugs.includes(s.slug));
}

const has = (p) => !!p && existsSync(resolve(ROOT, p)) && statSync(resolve(ROOT, p)).isFile();

if (opts.list) {
  for (const s of scenes) {
    const marks = [`screen ${has(s.screen) ? 'есть' : 'НЕТ'}`];
    if (s.device === 'duo') marks.push(`phoneScreen ${has(s.phoneScreen) ? 'есть' : 'НЕТ'}`);
    console.log(`${s.slug.padEnd(18)} ${String(s.device).padEnd(8)} ${String(s.angle).padEnd(6)} ${String(s.background).padEnd(6)} ${marks.join(', ')}`);
  }
  process.exit(0);
}

// ---------- окружение ----------
function findChromium() {
  const cache = join(homedir(), 'Library/Caches/ms-playwright');
  if (existsSync(cache)) {
    const dir = readdirSync(cache).filter((d) => /^chromium-\d+$/.test(d)).sort().pop();
    if (dir) {
      for (const app of ['Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing', 'Chromium.app/Contents/MacOS/Chromium']) {
        const p = join(cache, dir, 'chrome-mac-arm64', app);
        if (existsSync(p)) return p;
      }
    }
  }
  return '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.avif': 'image/avif', '.gif': 'image/gif',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf',
};

// Локальный статический сервер от корня проекта: шаблон и скриншоты в одном origin,
// поэтому шаблон может читать пиксели скриншота (тема шапки, цвет статус-бара).
function serve(root) {
  return new Promise((done, fail) => {
    const server = createServer((req, res) => {
      let file;
      try {
        file = resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://x').pathname));
      } catch {
        res.writeHead(400).end();
        return;
      }
      if (file !== root && !file.startsWith(root + sep)) {
        res.writeHead(403).end();
        return;
      }
      if (!existsSync(file) || !statSync(file).isFile()) {
        res.writeHead(404).end();
        return;
      }
      res.writeHead(200, { 'Content-Type': MIME[extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      createReadStream(file).pipe(res);
    });
    server.on('error', fail);
    server.listen(0, '127.0.0.1', () => done(server));
  });
}

const urlPath = (p) => '/' + relative(ROOT, resolve(ROOT, p)).split(sep).map(encodeURIComponent).join('/');

// ---------- кодирование JPEG ----------
const PY = `
import os, sys
from PIL import Image
src, dst, w, h, qmax, qmin, target = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4]), int(sys.argv[5]), int(sys.argv[6]), int(sys.argv[7])
im = Image.open(src).convert('RGB')
if im.size != (w, h):
    im = im.resize((w, h), Image.LANCZOS)
q = qmax
while True:
    im.save(dst, 'JPEG', quality=q, optimize=True, progressive=True)
    if os.path.getsize(dst) <= target or q <= qmin:
        break
    q = max(qmin, q - 2)
print(q)
`;

let encoder = null;
function pickEncoder() {
  if (encoder) return encoder;
  // MOCKUP_ENCODER=pillow|ffmpeg|none принудительно выбирает кодировщик (для отладки)
  const forced = process.env.MOCKUP_ENCODER;
  if (!forced || forced === 'pillow') {
    for (const py of ['python3', 'python']) {
      const r = spawnSync(py, ['-c', 'import PIL'], { stdio: 'ignore' });
      if (r.status === 0) return (encoder = { kind: 'pillow', bin: py });
    }
  }
  if (!forced || forced === 'ffmpeg') {
    if (spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status === 0) return (encoder = { kind: 'ffmpeg', bin: 'ffmpeg' });
  }
  return (encoder = { kind: 'none' });
}

// PNG → JPEG нужного размера. Возвращает использованное качество.
function encodeJpeg(pngPath, jpgPath) {
  const enc = pickEncoder();
  if (enc.kind === 'pillow') {
    const r = spawnSync(enc.bin, ['-c', PY, pngPath, jpgPath, WIDTH, HEIGHT, QUALITY_MAX, QUALITY_MIN, TARGET_BYTES].map(String), { encoding: 'utf8' });
    if (r.status !== 0) throw new Error(`Pillow: ${r.stderr.trim()}`);
    return Number(r.stdout.trim());
  }
  if (enc.kind === 'ffmpeg') {
    // у ffmpeg своя шкала: -q:v 2 ≈ 90, 3 ≈ 86, 4 ≈ 82, 5 ≈ 78
    for (const [qv, q] of [[3, 86], [4, 82], [5, 78]]) {
      const r = spawnSync(enc.bin, ['-y', '-loglevel', 'error', '-i', pngPath, '-vf', `scale=${WIDTH}:${HEIGHT}:flags=lanczos`, '-q:v', String(qv), '-pix_fmt', 'yuvj420p', jpgPath], { encoding: 'utf8' });
      if (r.status !== 0) throw new Error(`ffmpeg: ${r.stderr.trim()}`);
      if (statSync(jpgPath).size <= TARGET_BYTES || q === QUALITY_MIN) return q;
    }
  }
  return null;
}

// 3D-слои и размытые тени растеризуются не за один кадр: снимаем, пока два кадра подряд не совпадут.
async function stableShot(page) {
  await page.waitForTimeout(200);
  let prev = await page.screenshot({ type: 'png' });
  for (let i = 0; i < 4; i++) {
    await page.waitForTimeout(150);
    const next = await page.screenshot({ type: 'png' });
    if (next.equals(prev)) return next;
    prev = next;
  }
  return prev;
}

// ---------- съёмка ----------
mkdirSync(outDir, { recursive: true });
const tmp = mkdtempSync(join(tmpdir(), 'mockup-'));
const server = await serve(ROOT);
const origin = `http://127.0.0.1:${server.address().port}`;
const enc = pickEncoder();
const ss = enc.kind === 'none' ? 1 : opts.ss;
if (enc.kind === 'none') console.warn('! нет ни Pillow, ни ffmpeg — снимаю JPEG средствами браузера, без суперсэмплинга');

const browser = await chromium.launch({ executablePath: findChromium(), headless: true });
const ctx = await browser.newContext({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: ss, colorScheme: 'light' });

const done = [];
const skipped = [];
const failed = [];

for (const scene of scenes) {
  const { slug } = scene;
  if (!slug) {
    console.warn('! сцена без slug пропущена');
    continue;
  }
  if (!has(scene.screen)) {
    console.warn(`! ${slug}: нет сырого кадра ${scene.screen || '(screen не задан)'} — пропускаю`);
    skipped.push(slug);
    continue;
  }
  const params = { ...scene };
  delete params.slug;
  delete params.note;
  if (params.device === 'duo' && !has(params.phoneScreen)) {
    console.warn(`! ${slug}: нет мобильного кадра ${params.phoneScreen || '(phoneScreen не задан)'} — собираю как browser`);
    params.device = 'browser';
    delete params.phoneScreen;
  }
  const stamp = (p) => `${urlPath(p)}?v=${Math.round(statSync(resolve(ROOT, p)).mtimeMs)}`;
  params.screen = stamp(params.screen);
  if (params.phoneScreen) params.phoneScreen = stamp(params.phoneScreen);

  const page = await ctx.newPage();
  try {
    page.on('pageerror', (e) => console.warn(`! ${slug}: ${e.message}`));
    await page.addInitScript((s) => { window.__SCENE__ = s; }, params);
    await page.goto(`${origin}/tools/mockup.html`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__READY__ === true || !!window.__ERROR__, null, { timeout: 45000 });
    const error = await page.evaluate(() => window.__ERROR__ || null);
    if (error) throw new Error(error);
    const info = await page.evaluate(() => window.__SCENE_INFO__);
    const m = info.margins;
    if (Math.min(m.left, m.top, m.right, m.bottom) < 24) {
      console.warn(`! ${slug}: устройство подходит вплотную к краю кадра (отступы ${[m.left, m.top, m.right, m.bottom].map(Math.round).join('/')} px) — уменьши fill`);
    }

    const jpgPath = join(outDir, `${slug}.jpg`);
    let quality;
    if (enc.kind === 'none') {
      quality = QUALITY_MAX;
      await page.screenshot({ path: jpgPath, type: 'jpeg', quality });
    } else {
      const pngPath = join(tmp, `${slug}.png`);
      writeFileSync(pngPath, await stableShot(page));
      quality = encodeJpeg(pngPath, jpgPath);
      rmSync(pngPath, { force: true });
    }
    const kb = statSync(jpgPath).size / 1024;
    const over = kb * 1024 > TARGET_BYTES ? '  ! тяжелее 400 КБ' : '';
    console.log(`✓ ${slug.padEnd(18)} ${`${info.device}/${info.angle}/${info.background}`.padEnd(22)} ${kb.toFixed(0).padStart(4)} КБ  q${quality}${over}  → ${relative(ROOT, jpgPath)}`);
    done.push(slug);
  } catch (e) {
    console.error(`✗ ${slug}: ${e.message}`);
    failed.push(slug);
  } finally {
    await page.close();
  }
}

await browser.close();
server.close();
rmSync(tmp, { recursive: true, force: true });

console.log(`\nсобрано: ${done.length}, пропущено: ${skipped.length}${skipped.length ? ` (${skipped.join(', ')})` : ''}${failed.length ? `, с ошибкой: ${failed.join(', ')}` : ''}`);
process.exit(failed.length ? 1 : 0);
