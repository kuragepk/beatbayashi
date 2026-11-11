#!/usr/bin/env node

// SPDX-FileCopyrightText: 2026 BeatBayashi contributors
//
// SPDX-License-Identifier: MIT-0

// Generates each app's copy of the rights disclosure from docs/rights-notice.json.
//
//   node scripts/sync-rights-notice.mjs          write the copies
//   node scripts/sync-rights-notice.mjs --check  verify they match (for CI)
//
// The web and mobile apps must not disagree about what a user is allowed to do.
// Editing the generated copies by hand is how that drift starts, so edit the
// canonical JSON and re-run this instead.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';
import { appRoot } from './lib/app-root.mjs';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = join(repoRoot, 'docs/rights-notice.json');
const notice = JSON.parse(readFileSync(sourcePath, 'utf8'));
delete notice.$comment;

const banner = [
  '// Generated file — do not edit directly.',
  '// Source: docs/rights-notice.json',
  '// Regenerate: node scripts/sync-rights-notice.mjs',
].join('\n');

const body = JSON.stringify(notice, null, 2);

const TS_TYPES = `export interface LocalisedText {
  en: string;
  ja: string;
  /** Simplified Chinese (zh-Hans). */
  zh: string;
  'zh-Hant-TW': string;
  'zh-Hant-HK': string;
  hi: string;
  ko: string;
  es: string;
  ar: string;
  fr: string;
}

export type NoticeLanguage = keyof LocalisedText;

export interface Permission extends LocalisedText {
  /** Tooltip shown on hover, English only. */
  detail: string;
}

export interface LanguageOption {
  code: keyof LocalisedText;
  label: string;
  dir: 'ltr' | 'rtl';
  /** False: machine-written and not yet checked by the owner, so the app
   *  shows machineTranslationNote in that language. */
  reviewedByOwner: boolean;
}

/** UI labels: English is required, other languages fall back to English. */
export type UiText = { en: string } & Partial<Record<keyof LocalisedText, string>>;

export interface DetailSection {
  title: LocalisedText;
  body: LocalisedText;
}

export interface RightsNotice {
  version: string;
  languages: LanguageOption[];
  ui: {
    trustButton: UiText;
    close: UiText;
    languageLabel: UiText;
  };
  headline: LocalisedText;
  permissions: Permission[];
  synthesis: LocalisedText;
  /** Code licence and the terms for the built-in presets and patterns. */
  licenceTerms: LocalisedText;
  translationDisclaimer: string;
  /** Shown in a language whose reviewedByOwner is false. */
  machineTranslationNote: Partial<Record<keyof LocalisedText, string>>;
  detail: {
    title: LocalisedText;
    sections: DetailSection[];
    dataFlow: {
      web: DetailSection;
      /** Mobile saves to a user-chosen backend; {apiBaseUrl} is substituted at runtime. */
      mobile: LocalisedText;
    };
    footer: LocalisedText;
  };
  evidence: {
    audioFilesInRepository: number;
    howToVerify: string;
    codeLicence: string;
    contentRights: string;
    runtimeDependencies: string;
  };
}
`;

const targets = [
  {
    path: join(appRoot(repoRoot), 'src/rights/rightsNotice.generated.ts'),
    contents: `${banner}\n\n${TS_TYPES}\nexport const RIGHTS_NOTICE: RightsNotice = ${body};\n`,
  },
  // The phone app lives only in the main repository; the public copy has none.
  ...(existsSync(join(repoRoot, 'beatbayashi-mobile'))
    ? [
        {
          path: join(repoRoot, 'beatbayashi-mobile/rightsNotice.generated.js'),
          contents: `${banner}\n\nexport const RIGHTS_NOTICE = ${body};\n`,
        },
      ]
    : []),
];

const checkOnly = process.argv.includes('--check');
let drifted = 0;

for (const target of targets) {
  const label = relative(repoRoot, target.path);
  let current = null;
  try {
    current = readFileSync(target.path, 'utf8');
  } catch {
    current = null;
  }

  const normalize = (text) => (text === null ? null : text.replace(/\r\n/g, '\n'));

  if (normalize(current) === normalize(target.contents)) {
    console.log(`  ok       ${label}`);
    continue;
  }

  if (checkOnly) {
    console.error(`  DRIFTED  ${label}`);
    drifted += 1;
    continue;
  }

  mkdirSync(dirname(target.path), { recursive: true });
  writeFileSync(target.path, target.contents);
  console.log(`  written  ${label}`);
}

if (drifted > 0) {
  console.error(
    `\n${drifted} file(s) differ from the canonical notice. Run: node scripts/sync-rights-notice.mjs`
  );
  process.exit(1);
}
