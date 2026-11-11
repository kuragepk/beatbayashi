// SPDX-FileCopyrightText: 2026 Open Rhythm Box contributors
//
// SPDX-License-Identifier: MIT
'use strict';
// Own implementation of the sanitize-filename API (input, {replacement}).
// Rules: strip / ? < > \ : * | ", C0/C1 control chars, "." / ".." style names,
// Windows reserved device names (with or without extension), trailing dots and
// spaces; result capped at 255 UTF-8 bytes without splitting a character.

const ILLEGAL = /[/?<>\:*|"]/g;
const CONTROL = /[\u0000-\u001f\u0080-\u009f]/g;
const DOTS_ONLY = /^\.+$/;
const WIN_RESERVED = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i;
const MAX_BYTES = 255;

function trimTrailingDotsAndSpaces(s, replacement) {
  let end = s.length;
  while (end > 0 && (s[end - 1] === '.' || s[end - 1] === ' ')) end--;
  return end < s.length ? s.slice(0, end) + replacement : s;
}

function truncateUtf8(s, maxBytes) {
  if (Buffer.byteLength(s, 'utf8') <= maxBytes) return s;
  let bytes = 0;
  let out = '';
  for (const ch of s) { // iterates by code point, so surrogate pairs stay whole
    const n = Buffer.byteLength(ch, 'utf8');
    if (bytes + n > maxBytes) break;
    bytes += n;
    out += ch;
  }
  return out;
}

function sanitize(input, replacement) {
  const s = input
    .replace(ILLEGAL, replacement)
    .replace(CONTROL, replacement)
    .replace(DOTS_ONLY, replacement)
    .replace(WIN_RESERVED, replacement);
  return truncateUtf8(trimTrailingDotsAndSpaces(s, replacement), MAX_BYTES);
}

module.exports = function sanitizeFilename(input, options) {
  if (typeof input !== 'string') throw new Error('Input must be string');
  const replacement = (options && options.replacement) || '';
  const out = sanitize(input, replacement);
  return replacement === '' ? out : sanitize(out, '');
};
