// SPDX-FileCopyrightText: 2026 BeatBayashi contributors
//
// SPDX-License-Identifier: MIT-0

// Logic test for scripts/fetch-kit-fonts.mjs. No real network: file:// URLs and
// a 127.0.0.1 server that is closed in afterAll. Uses synthetic bytes, so it
// also runs on a clean checkout.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { mkdirSync, mkdtempSync, writeFileSync, readFileSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { deflateRawSync } from 'node:zlib';
import { RETRY_DELAYS_MS, run, sha256, zipMembers } from '../../scripts/fetch-kit-fonts.mjs';

const tmp = mkdtempSync(path.join(tmpdir(), 'kit-fonts-test-'));
const mk = (name: string) => path.join(tmp, name);
const A = Buffer.from('font-A-bytes'.repeat(50));
const B = Buffer.from('font-B-bytes'.repeat(70));

function crc32(buf: Buffer): number {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

/** Tiny zip writer for the test: members [{name, data, deflate}] */
function makeZip(members: { name: string; data: Buffer; deflate: boolean }[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const m of members) {
    const stored = m.deflate ? deflateRawSync(m.data) : m.data;
    const name = Buffer.from(m.name);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4);
    lh.writeUInt16LE(m.deflate ? 8 : 0, 8);
    lh.writeUInt32LE(crc32(m.data), 14);
    lh.writeUInt32LE(stored.length, 18);
    lh.writeUInt32LE(m.data.length, 22);
    lh.writeUInt16LE(name.length, 26);
    const local = Buffer.concat([lh, name, stored]);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0);
    ch.writeUInt16LE(20, 4);
    ch.writeUInt16LE(20, 6);
    ch.writeUInt16LE(m.deflate ? 8 : 0, 10);
    ch.writeUInt32LE(crc32(m.data), 16);
    ch.writeUInt32LE(stored.length, 20);
    ch.writeUInt32LE(m.data.length, 24);
    ch.writeUInt16LE(name.length, 28);
    ch.writeUInt32LE(offset, 42);
    centrals.push(Buffer.concat([ch, name]));
    locals.push(local);
    offset += local.length;
  }
  const cd = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(members.length, 8);
  eocd.writeUInt16LE(members.length, 10);
  eocd.writeUInt32LE(cd.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, eocd]);
}

function pinsFile(name: string, pins: object[]): string {
  const p = mk(name);
  writeFileSync(p, JSON.stringify({ pins }));
  return p;
}

let server: Server;
let port = 0;
// Requests per path, for the retry tests.
const hits = new Map<string, number>();
const hitCount = (p: string) => hits.get(p) ?? 0;
const zipBuf = makeZip([
  { name: 'pkg/readme.txt', data: Buffer.from('hello'), deflate: true },
  { name: 'pkg/sub/B.ttf', data: B, deflate: true },
  { name: 'pkg/A.ttf', data: A, deflate: false },
]);

beforeAll(async () => {
  writeFileSync(mk('A.ttf'), A);
  writeFileSync(mk('pkg.zip'), zipBuf);
  server = createServer((req, res) => {
    const url = req.url ?? '';
    hits.set(url, hitCount(url) + 1);
    if (url === '/A.ttf' || url === '/A-second.ttf') res.end(A);
    else if (url === '/bad.ttf') res.end(Buffer.from('tampered'));
    else if (url === '/flaky.ttf') {
      // Busy for the first two requests, then answers, like a gateway that recovers.
      if (hitCount(url) <= 2) {
        res.statusCode = 503;
        res.end();
      } else res.end(A);
    } else if (url === '/down.ttf') {
      res.statusCode = 504;
      res.end();
    } else if (url === '/stall.ttf') {
      // Never answers; the client's timeout has to end it.
    } else {
      res.statusCode = 404;
      res.end();
    }
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  port = (server.address() as { port: number }).port;
});

afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((r) => server.close(() => r()));
  rmSync(tmp, { recursive: true, force: true });
});

describe('fetch-kit-fonts', () => {
  it('downloads a missing font from file:// and writes it only after the sha256 matches', async () => {
    const dest = mk('d1');
    const pins = pinsFile('p1.json', [{ file: 'fam/A.ttf', sha256: sha256(A), url: pathToFileURL(mk('A.ttf')).href }]);
    const r = await run({ pins, dest, allowLocal: true });
    expect(r.fetched).toEqual(['fam/A.ttf']);
    expect(readFileSync(path.join(dest, 'fam', 'A.ttf')).equals(A)).toBe(true);
  });

  it('does not touch the network when the file is already present and matches', async () => {
    const dest = mk('d2');
    await run({ pins: pinsFile('p2.json', [{ file: 'A.ttf', sha256: sha256(A), url: pathToFileURL(mk('A.ttf')).href }]), dest, allowLocal: true });
    let calls = 0;
    const r = await run({
      pins: mk('p2.json'),
      dest,
      fetchBytes: async () => {
        calls++;
        throw new Error('network must not be used');
      },
    });
    expect(calls).toBe(0);
    expect(r.ok).toEqual(['A.ttf']);
    expect(r.errors).toEqual([]);
  });

  it('refuses a sha256 mismatch from a local http server and leaves nothing behind', async () => {
    const dest = mk('d3');
    const pins = pinsFile('p3.json', [{ file: 'bad.ttf', sha256: sha256(A), url: `http://127.0.0.1:${port}/bad.ttf` }]);
    const r = await run({ pins, dest, allowLocal: true });
    expect(r.mismatch.length).toBe(1);
    expect(r.fetched).toEqual([]);
    expect(existsSync(path.join(dest, 'bad.ttf'))).toBe(false);
    expect(existsSync(path.join(dest, 'bad.ttf.part'))).toBe(false);
  });

  it('downloads over a local http server when the sha256 matches', async () => {
    const dest = mk('d4');
    const pins = pinsFile('p4.json', [{ file: 'A.ttf', sha256: sha256(A), url: `http://127.0.0.1:${port}/A.ttf` }]);
    const r = await run({ pins, dest, allowLocal: true });
    expect(r.fetched).toEqual(['A.ttf']);
  });

  it('reports a present file with the wrong sha256 as a mismatch (and does not overwrite it)', async () => {
    const dest = mk('d5');
    mkdirSync(dest, { recursive: true });
    writeFileSync(path.join(dest, 'A.ttf'), 'wrong');
    const r = await run({ pins: pinsFile('p5.json', [{ file: 'A.ttf', sha256: sha256(A), url: 'https://example.invalid/A.ttf' }]), dest });
    expect(r.mismatch.length).toBe(1);
    expect(readFileSync(path.join(dest, 'A.ttf'), 'utf8')).toBe('wrong');
  });

  it('extracts members from a zip by basename (stored and deflated) and fetches the zip once', async () => {
    const dest = mk('d6');
    const url = pathToFileURL(mk('pkg.zip')).href;
    const pins = pinsFile('p6.json', [
      { file: 'a/A.ttf', sha256: sha256(A), url, archiveMember: 'A.ttf' },
      { file: 'b/B.ttf', sha256: sha256(B), url, archiveMember: 'B.ttf' },
    ]);
    let calls = 0;
    const r = await run({
      pins,
      dest,
      fetchBytes: async (u: string) => {
        calls++;
        return readFileSync(new URL(u));
      },
    });
    expect(r.fetched.sort()).toEqual(['a/A.ttf', 'b/B.ttf']);
    expect(calls).toBe(1);
    expect(zipMembers(zipBuf, 'readme.txt')[0].data.toString()).toBe('hello');
  });

  it('refuses a zip whose member has a different sha256', async () => {
    const dest = mk('d7');
    const pins = pinsFile('p7.json', [{ file: 'A.ttf', sha256: sha256(B), url: pathToFileURL(mk('pkg.zip')).href, archiveMember: 'A.ttf' }]);
    const r = await run({ pins, dest, allowLocal: true });
    expect(r.mismatch.length).toBe(1);
    expect(existsSync(path.join(dest, 'A.ttf'))).toBe(false);
  });

  it('refuses non-https URLs from the real code path unless local mode is on', async () => {
    const dest = mk('d8');
    const pins = pinsFile('p8.json', [{ file: 'A.ttf', sha256: sha256(A), url: pathToFileURL(mk('A.ttf')).href }]);
    const r = await run({ pins, dest });
    expect(r.errors.length).toBe(1);
    expect(readdirSync(tmp)).not.toContain('d8');
  });

  it('--check mode reports missing files without fetching', async () => {
    const r = await run({ pins: pinsFile('p9.json', [{ file: 'A.ttf', sha256: sha256(A), url: 'https://example.invalid/A.ttf' }]), dest: mk('d9'), check: true });
    expect(r.missing).toEqual(['A.ttf']);
  });

  it('tries again after 5 s and 20 s when the server is busy, and keeps the font once it answers', async () => {
    const dest = mk('d10');
    const pins = pinsFile('p10.json', [{ file: 'A.ttf', sha256: sha256(A), url: `http://127.0.0.1:${port}/flaky.ttf` }]);
    const waits: number[] = [];
    const r = await run({ pins, dest, allowLocal: true, sleep: async (ms: number) => void waits.push(ms) });
    expect(r.fetched).toEqual(['A.ttf']);
    expect(r.errors).toEqual([]);
    expect(hitCount('/flaky.ttf')).toBe(3);
    expect(waits).toEqual(RETRY_DELAYS_MS.slice(0, 2));
    expect(RETRY_DELAYS_MS).toEqual([5_000, 20_000, 60_000]);
  });

  it('does not try a 404 again', async () => {
    const before = hitCount('/gone.ttf');
    const waits: number[] = [];
    const r = await run({
      pins: pinsFile('p11.json', [{ file: 'A.ttf', sha256: sha256(A), url: `http://127.0.0.1:${port}/gone.ttf` }]),
      dest: mk('d11'),
      allowLocal: true,
      sleep: async (ms: number) => void waits.push(ms),
    });
    expect(r.errors).toEqual([`A.ttf: HTTP 404 for http://127.0.0.1:${port}/gone.ttf`]);
    expect(hitCount('/gone.ttf') - before).toBe(1);
    expect(waits).toEqual([]);
  });

  it('gives up after four tries on a 504 and does not start the remaining downloads', async () => {
    const dest = mk('d12');
    const pins = pinsFile('p12.json', [
      { file: 'down/A.ttf', sha256: sha256(A), url: `http://127.0.0.1:${port}/down.ttf` },
      { file: 'other/A.ttf', sha256: sha256(A), url: `http://127.0.0.1:${port}/A-second.ttf` },
    ]);
    const before = hitCount('/A-second.ttf');
    const r = await run({ pins, dest, allowLocal: true, sleep: async () => {} });
    expect(hitCount('/down.ttf')).toBe(4);
    expect(hitCount('/A-second.ttf') - before).toBe(0);
    expect(r.errors).toEqual([
      `down/A.ttf: HTTP 504 for http://127.0.0.1:${port}/down.ttf (gave up after 4 tries)`,
      `other/A.ttf: not tried, because the download from http://127.0.0.1:${port}/down.ttf kept failing`,
    ]);
    expect(existsSync(path.join(dest, 'other', 'A.ttf'))).toBe(false);
  });

  it('still reports every font of a zip that could not be fetched, with the real reason', async () => {
    const url = `http://127.0.0.1:${port}/down.ttf`;
    const r = await run({
      pins: pinsFile('p13.json', [
        { file: 'a/A.ttf', sha256: sha256(A), url, archiveMember: 'A.ttf' },
        { file: 'b/B.ttf', sha256: sha256(B), url, archiveMember: 'B.ttf' },
      ]),
      dest: mk('d13'),
      allowLocal: true,
      retryDelaysMs: [0],
    });
    expect(r.errors).toEqual([
      `a/A.ttf: HTTP 504 for ${url} (gave up after 2 tries)`,
      `b/B.ttf: HTTP 504 for ${url} (gave up after 2 tries)`,
    ]);
  });

  it('tries again when the server does not answer within the time limit', async () => {
    const r = await run({
      pins: pinsFile('p14.json', [{ file: 'A.ttf', sha256: sha256(A), url: `http://127.0.0.1:${port}/stall.ttf` }]),
      dest: mk('d14'),
      allowLocal: true,
      attemptTimeoutMs: 100,
      retryDelaysMs: [0],
    });
    expect(hitCount('/stall.ttf')).toBe(2);
    expect(r.errors).toEqual([`A.ttf: no answer within 0.1 s for http://127.0.0.1:${port}/stall.ttf (gave up after 2 tries)`]);
  });

  it('tries again when the connection is refused', async () => {
    // A port that was free a moment ago and has nothing listening now.
    const probe = createServer();
    await new Promise<void>((r) => probe.listen(0, '127.0.0.1', () => r()));
    const closedPort = (probe.address() as { port: number }).port;
    await new Promise<void>((r) => probe.close(() => r()));
    const retries: number[] = [];
    const r = await run({
      pins: pinsFile('p15.json', [{ file: 'A.ttf', sha256: sha256(A), url: `http://127.0.0.1:${closedPort}/A.ttf` }]),
      dest: mk('d15'),
      allowLocal: true,
      retryDelaysMs: [0, 0],
      onRetry: (_e: Error, nextTry: number) => void retries.push(nextTry),
    });
    expect(retries).toEqual([2, 3]);
    expect(r.errors.length).toBe(1);
    expect(r.errors[0]).toMatch(/\(gave up after 3 tries\)$/);
  });

  it('the committed pin list is complete: 18 https pins with a 64-hex sha256', () => {
    const { pins } = JSON.parse(readFileSync(path.join(__dirname, '..', '..', 'scripts', 'kit-fonts.pinned.json'), 'utf8'));
    expect(pins.length).toBe(18);
    for (const p of pins) {
      expect(p.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(p.url.startsWith('https://')).toBe(true);
    }
  });
});
