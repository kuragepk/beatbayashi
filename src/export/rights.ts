// SPDX-FileCopyrightText: 2026 BeatBayashi contributors
// SPDX-License-Identifier: MIT-0
//
// The rights metadata every export carries.
//
// Two different things used to share one "licence" field: the licence of the
// app's code, and the status of what the app produced. They are separate. The
// code is MIT-0. What you export (patterns, audio, MIDI, sound settings) is
// offered under CC0 1.0 or MIT-0, whichever the user chooses (owner decision
// 2026-10-02, replacing CC0 only from 2026-09-30). Neither asks for
// attribution.
//
// "CC0-1.0" and "MIT-0" are SPDX identifiers, used here only to describe the
// terms; they imply no endorsement by Creative Commons or anyone else.

export const GENERATOR = 'BeatBayashi 0.1.0';
export const GENERATOR_LICENCE = 'MIT-0';
export const CONTENT_RIGHTS_ID = 'CC0-1.0 OR MIT-0';
/** Identifier written by builds from 2026-09-30 to 2026-10-06; read as the current terms. */
export const LEGACY_CONTENT_RIGHTS_ID = 'CC0-1.0';
export const CONTENT_RIGHTS_URL = 'https://creativecommons.org/publicdomain/zero/1.0/';
export const CONTENT_RIGHTS_ALT_URL = 'https://opensource.org/license/mit-0';

export interface ContentRights {
  /** SPDX expression for the exported content: either licence, the user's choice. */
  spdx: typeof CONTENT_RIGHTS_ID;
  /** CC0 1.0 legal code. */
  url: typeof CONTENT_RIGHTS_URL;
  /** MIT-0 text. */
  altUrl: typeof CONTENT_RIGHTS_ALT_URL;
  statement: string;
}

export interface ExportRightsFields {
  generator: string;
  /** Licence of the app that wrote the file, not of the file's content. */
  generatorLicence: typeof GENERATOR_LICENCE;
  contentRights: ContentRights;
}

export const CONTENT_RIGHTS: ContentRights = {
  spdx: CONTENT_RIGHTS_ID,
  url: CONTENT_RIGHTS_URL,
  altUrl: CONTENT_RIGHTS_ALT_URL,
  statement:
    'The BeatBayashi project offers any rights it has in this content under ' +
    'CC0 1.0 or MIT-0, whichever you choose. No attribution needed.',
};

export function exportRightsFields(): ExportRightsFields {
  return {
    generator: GENERATOR,
    generatorLicence: GENERATOR_LICENCE,
    contentRights: { ...CONTENT_RIGHTS },
  };
}

/** One short line for formats that only hold plain text (SFZ comment, MIDI text event). */
export const CONTENT_RIGHTS_LINE = `Content: CC0-1.0 OR MIT-0, your choice, no attribution needed. ${CONTENT_RIGHTS_URL}`;

/**
 * Pattern JSON as written by older builds (version 1) had either
 * `licence: 'MIT (code). The pattern is yours.'` or a plain-string
 * `contentRights`; version 2 files from 2026-09-30 to 2026-10-06 say
 * `spdx: 'CC0-1.0'`. Read all of them as the current terms so nothing reading
 * old files has to special-case them.
 */
export function readContentRights(file: unknown): ContentRights | null {
  if (typeof file !== 'object' || file === null) return null;
  const f = file as Record<string, unknown>;
  const cr = f.contentRights;
  const spdx = typeof cr === 'object' && cr !== null ? (cr as { spdx?: unknown }).spdx : undefined;
  if (spdx === CONTENT_RIGHTS_ID || spdx === LEGACY_CONTENT_RIGHTS_ID) {
    return { ...CONTENT_RIGHTS };
  }
  if (typeof cr === 'string' || typeof f.licence === 'string') {
    return { ...CONTENT_RIGHTS };
  }
  return null;
}
