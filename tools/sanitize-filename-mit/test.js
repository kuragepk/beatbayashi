// SPDX-FileCopyrightText: 2026 Open Rhythm Box contributors
//
// SPDX-License-Identifier: MIT
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const sanitize = require('./index.js');

test('plain names pass through', () => assert.strictEqual(sanitize('Open Rhythm Box 1.0.exe'), 'Open Rhythm Box 1.0.exe'));
test('illegal characters removed', () => assert.strictEqual(sanitize('a/b\c:d*e?f"g<h>i|j'), 'abcdefghij'));
test('control characters removed', () => assert.strictEqual(sanitize('a\u0000b\u001fc\u0085d'), 'abcd'));
test('dot-only names emptied', () => { assert.strictEqual(sanitize('.'), ''); assert.strictEqual(sanitize('..'), ''); });
test('trailing dots and spaces stripped', () => assert.strictEqual(sanitize('name. . '), 'name'));
for (const n of ['con', 'PRN', 'aux.txt', 'Nul.tar.gz', 'COM1', 'lpt9.log']) {
  test('windows reserved: ' + n, () => assert.strictEqual(sanitize(n), ''));
}
test('names merely containing reserved words survive', () => {
  assert.strictEqual(sanitize('console'), 'console');
  assert.strictEqual(sanitize('com10'), 'com10');
});
test('replacement option', () => {
  assert.strictEqual(sanitize('a/b', { replacement: '_' }), 'a_b');
  assert.strictEqual(sanitize('con', { replacement: '_' }), '_');
});
test('non-string throws', () => assert.throws(() => sanitize(5), /Input must be string/));
test('ASCII capped at 255 bytes', () => assert.strictEqual(sanitize('a'.repeat(300)).length, 255));
test('multibyte truncation never splits a character', () => {
  const out = sanitize('あ'.repeat(100)); // 3 bytes each -> 85 chars = 255 bytes
  assert.strictEqual(Buffer.byteLength(out), 255);
  assert.strictEqual([...out].length, 85);
  const out2 = sanitize('a' + 'あ'.repeat(100)); // 1 + 84*3 = 253, next would be 256
  assert.strictEqual(Buffer.byteLength(out2), 253);
  assert.ok(!out2.includes('�'));
});
test('surrogate pairs stay whole', () => {
  const out = sanitize('😀'.repeat(100)); // 4 bytes each -> 63 = 252
  assert.strictEqual(Buffer.byteLength(out), 252);
  assert.strictEqual([...out].length, 63);
  assert.ok(!/[\ud800-\udbff](?![\udc00-\udfff])/.test(out));
});
test('short multibyte unchanged', () => assert.strictEqual(sanitize('リズム.wav'), 'リズム.wav'));
