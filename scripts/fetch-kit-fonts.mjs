#!/usr/bin/env node
// SPDX-FileCopyrightText: 2026 BeatBayashi contributors
//
// SPDX-License-Identifier: MIT-0

/**
 * Makes sure the theme kit's pixel/Japanese fonts exist in
 * src/theme/kit/fonts/ before the build (npm "prebuild" hook), so a clean
 * checkout (Cloudflare Pages, Render) ships them without the desk or a
 * local font folder.
 *
 *  - Reads scripts/kit-fonts.pinned.json (file, source URL, sha256).
 *  - A file already present with the right sha256 is left alone: no network
 *    is used (desk builds stay offline).
 *  - A file that is missing is downloaded (https only), verified, and only
 *    then written. A sha256 mismatch, a present-but-wrong file, or a
 *    download error exits 1 and fails the build. Nothing unverified is kept.
 *  - Zip sources (archiveMember) are read with a small built-in zip reader
 *    (no new dependencies, nothing is executed).
 *  - A download that fails on the server's or the network's side (HTTP 5xx,
 *    408, 429, no answer, a reset connection) is tried again after 5, 20 and
 *    60 seconds. A 404 or a refused URL is not retried. Once one source has
 *    failed every try, the remaining downloads are not started, so a host
 *    that is down costs one retry cycle, not one per font.
 *
 * Usage:
 *   node scripts/fetch-kit-fonts.mjs [--check] [--dest <dir>] [--pins <file>]
 *   BEATBAYASHI_SKIP_FONT_FETCH=1  skip entirely (the build then ships no pinned fonts)
 *
 * Fetched files should also pass `intake-desk check` on the desk before you
 * trust a new pin (see .claude/rules/intake-desk.md); the sha256 pin is what
 * the build enforces.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { inflateRawSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_PINS = path.join(HERE, 'kit-fonts.pinned.json');
export const DEFAULT_DEST = path.join(HERE, '..', 'src', 'theme', 'kit', 'fonts');
const MAX_BYTES = 120 * 1024 * 1024;
/** Waits before the second, third and fourth try of one download. */
export const RETRY_DELAYS_MS = [5_000, 20_000, 60_000];
/** One try gives up after this long, so a stalled connection is tried again instead of hanging the build. */
const ATTEMPT_TIMEOUT_MS = 120_000;

export const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

/** An error the next try may not repeat: the server or the network failed, not the request. */
function retryableError(message) {
  const e = new Error(message);
  e.retryable = true;
  return e;
}

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Calls fn until it succeeds, it throws an error without `retryable: true`,
 * or every delay has been used. The last error is thrown with the number of
 * tries added to its message.
 */
export async function withRetries(fn, { delays = RETRY_DELAYS_MS, sleep = defaultSleep, onRetry } = {}) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      if (!e || e.retryable !== true) throw e;
      if (attempt >= delays.length) {
        e.message = `${e.message} (gave up after ${attempt + 1} tries)`;
        throw e;
      }
      if (onRetry) onRetry(e, attempt + 2, delays[attempt]);
      await sleep(delays[attempt]);
    }
  }
}

/** Minimal zip reader: returns [{name, data}] for members whose basename matches. */
export function zipMembers(buf, basename) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65535); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('not a zip file (no end-of-central-directory record)');
  const count = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16);
  if (count === 0xffff || off === 0xffffffff) throw new Error('zip64 archives are not supported');
  const found = [];
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(off) !== 0x02014b50) throw new Error('corrupt zip central directory');
    const method = buf.readUInt16LE(off + 10);
    const csize = buf.readUInt32LE(off + 20);
    const nameLen = buf.readUInt16LE(off + 28);
    const extraLen = buf.readUInt16LE(off + 30);
    const commentLen = buf.readUInt16LE(off + 32);
    const local = buf.readUInt32LE(off + 42);
    const name = buf.toString('utf8', off + 46, off + 46 + nameLen);
    off += 46 + nameLen + extraLen + commentLen;
    if (name.endsWith('/') || path.posix.basename(name) !== basename) continue;
    if (buf.readUInt32LE(local) !== 0x04034b50) throw new Error('corrupt zip local header');
    const dataStart = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const raw = buf.subarray(dataStart, dataStart + csize);
    let data;
    if (method === 0) data = Buffer.from(raw);
    else if (method === 8) data = inflateRawSync(raw);
    else throw new Error(`unsupported zip method ${method} for ${name}`);
    found.push({ name, data });
  }
  return found;
}

async function defaultFetchBytes(url, { allowLocal, timeoutMs = ATTEMPT_TIMEOUT_MS }) {
  const u = new URL(url);
  if (u.protocol === 'file:') {
    if (!allowLocal) throw new Error(`refusing non-https URL: ${url}`);
    return readFile(fileURLToPath(u));
  }
  const localHttp = u.protocol === 'http:' && allowLocal && ['127.0.0.1', 'localhost'].includes(u.hostname);
  if (u.protocol !== 'https:' && !localHttp) throw new Error(`refusing non-https URL: ${url}`);
  // The timeout covers the headers and the body together.
  const signal = AbortSignal.timeout(timeoutMs);
  const noAnswer = (e) =>
    retryableError(e && e.name === 'TimeoutError' ? `no answer within ${timeoutMs / 1000} s for ${url}` : `${e && e.message} for ${url}`);
  let res;
  try {
    res = await fetch(url, { redirect: 'follow', signal });
  } catch (e) {
    throw noAnswer(e);
  }
  if (!res.ok) {
    const message = `HTTP ${res.status} for ${url}`;
    if (res.status >= 500 || res.status === 408 || res.status === 429) throw retryableError(message);
    throw new Error(message);
  }
  let buf;
  try {
    buf = Buffer.from(await res.arrayBuffer());
  } catch (e) {
    throw noAnswer(e);
  }
  if (buf.length > MAX_BYTES) throw new Error(`download larger than ${MAX_BYTES} bytes: ${url}`);
  return buf;
}

/**
 * @returns {Promise<{ok:string[], fetched:string[], missing:string[], mismatch:string[], errors:string[]}>}
 */
export async function run(opts = {}) {
  const pinsFile = opts.pins || DEFAULT_PINS;
  const dest = opts.dest || DEFAULT_DEST;
  const fetchBytes =
    opts.fetchBytes || ((url) => defaultFetchBytes(url, { allowLocal: !!opts.allowLocal, timeoutMs: opts.attemptTimeoutMs }));
  const retry = { delays: opts.retryDelaysMs || RETRY_DELAYS_MS, sleep: opts.sleep || defaultSleep, onRetry: opts.onRetry };
  const { pins } = JSON.parse(readFileSync(pinsFile, 'utf8'));
  const r = { ok: [], fetched: [], missing: [], mismatch: [], errors: [] };
  const cache = new Map(); // url -> Promise<Buffer>; a zip shared by several fonts is fetched once
  let downFrom = null; // the first source that failed every try; later downloads are not started

  for (const pin of pins) {
    const target = path.join(dest, ...pin.file.split('/'));
    if (existsSync(target)) {
      const have = sha256(readFileSync(target));
      if (have === pin.sha256) r.ok.push(pin.file);
      else r.mismatch.push(`${pin.file} (present sha256 ${have.slice(0, 12)} != pinned ${pin.sha256.slice(0, 12)}; delete it to refetch)`);
      continue;
    }
    if (opts.check) {
      r.missing.push(pin.file);
      continue;
    }
    if (downFrom && !cache.has(pin.url)) {
      r.errors.push(`${pin.file}: not tried, because the download from ${downFrom} kept failing`);
      continue;
    }
    try {
      if (!cache.has(pin.url)) cache.set(pin.url, withRetries(() => fetchBytes(pin.url), retry));
      let body;
      try {
        body = await cache.get(pin.url);
      } catch (e) {
        if (e && e.retryable === true && !downFrom) downFrom = pin.url;
        throw e;
      }
      let data = null;
      if (pin.archiveMember) {
        const hits = zipMembers(body, pin.archiveMember).filter((m) => sha256(m.data) === pin.sha256);
        if (hits.length === 0) {
          r.mismatch.push(`${pin.file} (no member named ${pin.archiveMember} in ${pin.url} has the pinned sha256)`);
          continue;
        }
        data = hits[0].data;
      } else {
        data = Buffer.from(body);
        const got = sha256(data);
        if (got !== pin.sha256) {
          r.mismatch.push(`${pin.file} (downloaded sha256 ${got.slice(0, 12)} != pinned ${pin.sha256.slice(0, 12)}; not written)`);
          continue;
        }
      }
      mkdirSync(path.dirname(target), { recursive: true });
      const tmp = `${target}.part`;
      writeFileSync(tmp, data);
      try {
        renameSync(tmp, target);
      } catch (e) {
        try {
          unlinkSync(tmp);
        } catch {
          /* ignore */
        }
        throw e;
      }
      r.fetched.push(pin.file);
    } catch (e) {
      r.errors.push(`${pin.file}: ${e.message}`);
    }
  }
  return r;
}

async function main() {
  const args = process.argv.slice(2);
  const val = (k) => {
    const i = args.indexOf(k);
    return i >= 0 ? args[i + 1] : undefined;
  };
  if ((process.env.BEATBAYASHI_SKIP_FONT_FETCH ?? process.env.KOINON_SKIP_FONT_FETCH) === '1') { // KOINON_* read until the next release (renamed 2026-10-06)
    console.log('[kit-fonts] BEATBAYASHI_SKIP_FONT_FETCH=1: skipped (no pinned fonts will be added)');
    return;
  }
  const r = await run({
    check: args.includes('--check'),
    dest: val('--dest'),
    pins: val('--pins'),
    allowLocal: !!val('--pins'),
    onRetry: (e, nextTry, ms) => console.error(`[kit-fonts] RETRY    ${e.message}; try ${nextTry} in ${ms / 1000} s`),
  });
  console.log(
    `[kit-fonts] present+verified ${r.ok.length}, fetched ${r.fetched.length}, missing ${r.missing.length}, mismatch ${r.mismatch.length}, errors ${r.errors.length}`,
  );
  for (const m of r.missing) console.error(`[kit-fonts] MISSING  ${m}`);
  for (const m of r.mismatch) console.error(`[kit-fonts] MISMATCH ${m}`);
  for (const m of r.errors) console.error(`[kit-fonts] ERROR    ${m}`);
  if (r.mismatch.length || r.errors.length || r.missing.length) process.exit(1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(`[kit-fonts] ${e.message}`);
    process.exit(1);
  });
}
