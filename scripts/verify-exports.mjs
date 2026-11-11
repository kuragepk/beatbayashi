#!/usr/bin/env node

// SPDX-FileCopyrightText: 2026 BeatBayashi contributors
//
// SPDX-License-Identifier: MIT-0

// Checks the export features by actually using them, in a real browser.
//
//   cd beatbayashi && pnpm run build && cd ..
//   npm install --no-save playwright      # not a project dependency
//   node scripts/verify-exports.mjs
//
// Unit tests cover the file writers (WAV, ZIP, SFZ) but cannot cover the part
// that needs a browser: rendering audio through Tone, the download, and what
// ends up in the file. That gap hid two real bugs - a silent cymbal in every
// exported instrument, and a pattern WAV export that produced nothing at all -
// so the gap is closed by driving the built app and inspecting what it hands
// over.
//
// Exits non-zero on the first thing that is not as promised.

import { createServer } from 'node:http';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { appRoot } from './lib/app-root.mjs';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(appRoot(repoRoot), 'dist');
const PORT = Number(process.env.ORB_VERIFY_PORT) || 4182;
const CONTENT_TYPE = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };

let failures = 0;
function check(label, ok, detail = '') {
  console.log(`${ok ? 'ok      ' : 'NOT OK  '} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.error(
    'playwright is not installed. It is deliberately not a dependency of this\n' +
      'project; install it just for this run:\n\n  npm install --no-save playwright\n'
  );
  process.exit(127);
}

try {
  await readFile(join(dist, 'index.html'));
} catch {
  console.error(`No build to check at ${dist}.\n\n  cd beatbayashi && pnpm run build\n`);
  process.exit(1);
}

const server = createServer(async (req, res) => {
  const path = req.url === '/' ? '/index.html' : req.url.split('?')[0];
  try {
    const body = await readFile(join(dist, path));
    res.writeHead(200, { 'Content-Type': CONTENT_TYPE[extname(path)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
});
await new Promise((resolve) => server.listen(PORT, '127.0.0.1', resolve));

const browser = await chromium.launch({
  executablePath: process.env.ORB_CHROMIUM || undefined,
  args: ['--autoplay-policy=no-user-gesture-required', '--no-sandbox'],
});
// The app follows the browser language on a first visit, and the labels below
// are the English ones; pin the locale so a Japanese desktop does not change them.
const context = await browser.newContext({ acceptDownloads: true, locale: 'en-US' });
const page = await context.newPage();
const downloadDir = await mkdtemp(join(tmpdir(), 'bb-verify-'));

const problems = [];
page.on('pageerror', (error) => problems.push(`page error: ${error.message}`));
page.on('dialog', async (dialog) => {
  problems.push(`${dialog.type()}: ${dialog.message()}`);
  await dialog.dismiss();
});

/** Peak amplitude of a 16-bit PCM WAV, and whether its header is self-consistent.
 *  Walks the RIFF chunks instead of assuming a 44-byte header: the exporter
 *  writes a LIST/INFO chunk (software tag) next to fmt and data. */
function inspectWav(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (at) => String.fromCharCode(...bytes.slice(at, at + 4));
  let fmt = -1;
  let data = -1;
  let dataSize = 0;
  let chunksFit = true;
  for (let at = 12; at + 8 <= bytes.length; ) {
    const size = view.getUint32(at + 4, true);
    if (tag(at) === 'fmt ') fmt = at + 8;
    if (tag(at) === 'data') { data = at + 8; dataSize = size; }
    const next = at + 8 + size + (size % 2);
    if (next > bytes.length) { chunksFit = next - (size % 2) === bytes.length; break; }
    at = next;
  }
  const channels = fmt >= 0 ? view.getUint16(fmt + 2, true) : 0;
  const sampleRate = fmt >= 0 ? view.getUint32(fmt + 4, true) : 0;
  let peak = 0;
  if (data >= 0) {
    for (let at = data; at + 1 < data + dataSize && at + 1 < bytes.length; at += 2) {
      peak = Math.max(peak, Math.abs(view.getInt16(at, true)) / 32768);
    }
  }
  return {
    isWav: tag(0) === 'RIFF' && tag(8) === 'WAVE' && fmt >= 0 && data >= 0,
    channels,
    sampleRate,
    bitsPerSample: fmt >= 0 ? view.getUint16(fmt + 14, true) : 0,
    sizeConsistent: chunksFit && view.getUint32(4, true) === bytes.length - 8 && data + dataSize <= bytes.length,
    seconds: channels && sampleRate ? dataSize / (channels * 2 * sampleRate) : 0,
    peak,
  };
}

async function saveDownload(download) {
  const path = join(downloadDir, download.suggestedFilename());
  await download.saveAs(path);
  return path;
}

try {
  await page.goto(`http://127.0.0.1:${PORT}/`);
  await page.waitForLoadState('networkidle');
  await page.mouse.click(5, 5); // audio needs a gesture before Tone will start
  await page.waitForTimeout(500);
  check('the app loads', (await page.title()).length > 0, await page.title());

  // --- The kit, as an SFZ instrument ---------------------------------------
  // data-testid, not the label: the label is translated (ControlPanel.tsx).
  await page.getByTestId('export-open').first().click();
  await page.waitForTimeout(300);
  const [zipDownload] = await Promise.all([
    page.waitForEvent('download', { timeout: 120000 }),
    page.locator('button', { hasText: /SFZ/i }).first().click(),
  ]);
  const zipPath = await saveDownload(zipDownload);
  const unpacked = join(downloadDir, 'kit');
  execFileSync('unzip', ['-o', '-q', zipPath, '-d', unpacked]);
  check('a standard unzip accepts the archive', true, zipDownload.suggestedFilename());

  const sfz = readFileSync(join(unpacked, 'beatbayashi-kit.sfz'), 'utf8');
  check('the .sfz names one region per voice', (sfz.match(/<region>/g) ?? []).length === 4);
  check('it states the rights inside the file', sfz.includes('no attribution required'));

  for (const voice of ['kick', 'tom', 'cymbal', 'clap']) {
    const sample = inspectWav(readFileSync(join(unpacked, 'samples', `${voice}.wav`)));
    check(`${voice}.wav is a WAV with audio in it`,
      sample.isWav && sample.sizeConsistent && sample.peak > 0.01,
      `peak ${sample.peak.toFixed(3)}, ${sample.seconds.toFixed(2)}s`);
  }

  // --- The pattern, as audio -----------------------------------------------
  const [wavDownload] = await Promise.all([
    page.waitForEvent('download', { timeout: 120000 }),
    page.locator('button', { hasText: /Export as WAV/i }).first().click(),
  ]);
  const wav = inspectWav(readFileSync(await saveDownload(wavDownload)));
  check('the WAV export is a real WAV', wav.isWav && wav.bitsPerSample === 16,
    `${wav.channels}ch ${wav.sampleRate}Hz ${wav.bitsPerSample}bit`);
  check('its header matches the bytes that follow it', wav.sizeConsistent);
  check('it contains audio, not silence', wav.peak > 0.01, `peak ${wav.peak.toFixed(3)}`);

  // --- A sound you keep, and take with you ---------------------------------
  await page.getByRole('button', { name: 'Sound settings' }).first().click();
  await page.waitForTimeout(400);
  await page.locator('input[aria-label="Name this sound"]').fill('Verification Sound');
  await page.getByRole('button', { name: 'Keep', exact: true }).click();
  await page.waitForTimeout(300);
  check('a kept sound appears in the list',
    (await page.locator('li', { hasText: 'Verification Sound' }).count()) === 1);

  await page.reload();
  await page.waitForLoadState('networkidle');
  await page.mouse.click(5, 5);
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: 'Sound settings' }).first().click();
  await page.waitForTimeout(400);
  check('it is still there after a reload',
    (await page.locator('li', { hasText: 'Verification Sound' }).count()) === 1);

  const [soundsDownload] = await Promise.all([
    page.waitForEvent('download', { timeout: 30000 }),
    page.locator('button', { hasText: /Export all/i }).click(),
  ]);
  const exported = JSON.parse(readFileSync(await saveDownload(soundsDownload), 'utf8'));
  check('exporting writes the kept sounds to a file',
    exported.version === 1 && exported.presets.some((p) => p.name === 'Verification Sound'),
    `${exported.presets.length} sound(s)`);

  await page.locator('button', { hasText: 'Load' }).first().click();
  await page.waitForTimeout(300);
  check('loading one back reports success',
    (await page.locator('p', { hasText: /^Loaded/ }).count()) === 1);

  check('nothing failed in the page', problems.length === 0, problems.join(' | '));
} finally {
  await browser.close();
  server.close();
  await rm(downloadDir, { recursive: true, force: true });
}

console.log(failures === 0 ? '\nAll export checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
