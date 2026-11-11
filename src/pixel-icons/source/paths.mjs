// Path options shared by make_ui16.mjs and render_sheet.mjs (2026-10-03). No machine paths are written here:
//   --recensio <dir>  or env RECENSIO_DIR   Recensio checkout (imported read-only, needs core/board.mjs, core/png.mjs).
//                                           Default: the first projects/recensio found walking up from this file.
//   --out <dir>       or env UI16_OUT        Where boards, panels, svg/png previews and icons.runs.json go.
//                                           Default: $BEATBAYASHI_OUT_DIR/beatbayashi-icons/ui16, else beatbayashi/.out/beatbayashi-icons/ui16
//                                           (git-ignored).
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = resolve(HERE, '../../..'); // beatbayashi/

export function argValue(name) {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : undefined;
}

function findRecensio() {
  for (let d = HERE; ; d = dirname(d)) {
    const c = join(d, 'projects', 'recensio');
    if (existsSync(join(c, 'core', 'board.mjs'))) return c;
    if (dirname(d) === d) return undefined;
  }
}

export function outDir() {
  const given = argValue('--out') || process.env.UI16_OUT;
  if (given) return resolve(given);
  const envOut = process.env.BEATBAYASHI_OUT_DIR || process.env.KOINON_OUT_DIR; // KOINON_OUT_DIR read until the next release (renamed 2026-10-06)
  const base = envOut ? resolve(envOut) : join(APP, '.out');
  return join(base, 'beatbayashi-icons', 'ui16');
}

export async function loadRecensio() {
  const dir = argValue('--recensio') || process.env.RECENSIO_DIR || findRecensio();
  if (!dir || !existsSync(join(dir, 'core', 'board.mjs'))) {
    throw new Error('Recensio not found: pass --recensio <dir> or set RECENSIO_DIR (a checkout with core/board.mjs)');
  }
  const url = (f) => pathToFileURL(join(resolve(dir), 'core', f)).href;
  const [board, png] = await Promise.all([import(url('board.mjs')), import(url('png.mjs'))]);
  return { ...board, ...png };
}
