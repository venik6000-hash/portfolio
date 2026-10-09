// Снимает картинку для превью ссылки (assets/og.jpg, 1200×630) с живой главной: аватар, имя и заголовок без дока.
// Usage: node tools/og.mjs [url]   — сайт должен быть запущен, по умолчанию http://127.0.0.1:4173/
import { chromium } from 'playwright-core';
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const url = process.argv[2] ?? 'http://127.0.0.1:4173/';
const out = resolve(dirname(fileURLToPath(import.meta.url)), '../assets/og.jpg');

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

const browser = await chromium.launch({ executablePath: findChromium(), headless: true });
// 800×420 при масштабе 1.5 дают ровно 1200×630, а hero занимает карточку плотнее, чем на полном десктопе.
const page = await browser.newPage({
  viewport: { width: 800, height: 420 },
  deviceScaleFactor: 1.5,
  colorScheme: 'light',
  reducedMotion: 'reduce',
});
await page.goto(url, { waitUntil: 'networkidle' });
// Без пилюли и дока hero больше не нужно приподнимать над доком: ставим его по центру кадра.
await page.addStyleTag({
  content: '.page-header, .dock, .cursor-dot { display: none !important; } body { --hero-shift: 0px !important; }',
});
await page.evaluate(() =>
  Promise.all([document.fonts.ready, ...[...document.querySelectorAll('.hero__avatar')].map((image) => image.decode().catch(() => {}))]),
);
await page.waitForTimeout(300);
await page.screenshot({ path: out, type: 'jpeg', quality: 90 });
await browser.close();
console.log(`written ${out}`);
