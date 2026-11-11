/* Shiroko UI System web kit — theme/1 + ui-settings/1 helpers (contrast maths,
 * validation, migration). This file is the single source; consumer apps (e.g.
 * Recensio) receive a synced copy via bin/sync-web-kit.mjs and must not hand-edit
 * their copy (edit here, then re-sync).
 * 依存: なし (素の ES モジュール)。
 * 来歴: JS 移植 (2026-09-27, シロコ委任エージェント)。もとは
 *   projects/recensio/web/theme-check.js (同日、同一移植元から作成) として書かれ、
 *   owner decisions #70-71 (15 preset themes, 共通 kit 化) を受けてここへ正本を移し、
 *   Recensio 側は同期コピーに切り替えた。移植元:
 *   projects/grammarouban-tools/packages/palette-check/src/grammarouban_palette_check/core.py
 *   (WCAG 2.x コントラスト計算、theme/1・ui-settings/1 の構造検査、色数上限、
 *   theme/1 minor 1 の THEME_ID_ALIASES/resolve_theme_id)。
 *   試験ベクトルは test/fixtures/palette-check-vectors.json に複製し、Python 側と
 *   一致することを test/theme-check.test.mjs で確認する。
 * 仕様: docs/design/DESIGN_20260926d_retro_ui_themes.md §1・§4 (机上 Claude-Code リポジトリ)。
 *
 * WCAG contrast maths follow WCAG 2.x (relative luminance / contrast ratio,
 * https://www.w3.org/TR/WCAG21/#contrast-minimum), decimal arithmetic on sRGB hex
 * triples only -- no external colour library.
 */

export const THEME_SCHEMA_ID = 'theme/1';
export const UI_SETTINGS_SCHEMA_ID = 'ui-settings/1';

// Minimum contrast ratios, WCAG 2.x 1.4.3 / 1.4.11.
export const RATIO_TEXT = 4.5; // normal body text
export const RATIO_LARGE = 3.0; // large text, borders, focus indicators, UI components

// (fgRole, bgRole, minimumRatio, purpose) -- checked against a theme's "color" map
// when both roles are present. Mirrors PAIR_RULES in the Python original.
export const PAIR_RULES = [
  ['text', 'surface', RATIO_TEXT, 'body text vs surface'],
  ['accent', 'surface', RATIO_LARGE, 'accent (large text / UI) vs surface'],
  ['border', 'surface', RATIO_LARGE, 'border vs surface'],
  ['focus', 'surface', RATIO_LARGE, 'focus indicator vs surface'],
  ['danger', 'surface', RATIO_LARGE, 'danger vs surface'],
  ['ok', 'surface', RATIO_LARGE, 'ok/success vs surface'],
  ['selection', 'surface', RATIO_LARGE, 'selection indicator vs surface'],
];

export const KNOWN_LIMITS = { '8bit': 8, '16bit': 16, '32bit': 32, '8bit-game': 8, '16bit-game': 16, handheld: 4 };

// theme/1 minor 1 (additive, owner decisions #70-71, 2026-09-27). Legacy ids stay
// valid theme files; a settings document that names a legacy id resolves to the
// preset-catalogue id here. Both ids carry identical colours.
export const THEME_ID_ALIASES = { '8bit': '8bit-game', '16bit': '16bit-game' };

export function resolveThemeId(themeId) {
  return THEME_ID_ALIASES[themeId] ?? themeId;
}

const HEX_RE = /^#[0-9a-fA-F]{6}$/;
// Owner decision 2026-09-27 (#74): "backdrop" (dim overlay behind a dialog) is the only
// role allowed a semi-transparent colour, as an 8-digit #rrggbbaa hex. Mirrors
// HEX8_RE/ALPHA_ROLES in the Python original (core.py).
const HEX8_RE = /^#[0-9a-fA-F]{8}$/;
export const ALPHA_ROLES = new Set(['backdrop']);

export function isHex(value) {
  return typeof value === 'string' && HEX_RE.test(value);
}

function isAlphaHex(value) {
  return typeof value === 'string' && HEX8_RE.test(value);
}

function isColorValue(value, role) {
  if (ALPHA_ROLES.has(role)) return isHex(value) || isAlphaHex(value);
  return isHex(value);
}

export function relativeLuminance(hex) {
  if (!isHex(hex)) throw new Error(`not a #rrggbb colour: ${JSON.stringify(hex)}`);
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const lin = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const [rl, gl, bl] = [lin(r), lin(g), lin(b)];
  return 0.2126 * rl + 0.7152 * gl + 0.0722 * bl;
}

export function contrastRatio(hexA, hexB) {
  const la = relativeLuminance(hexA);
  const lb = relativeLuminance(hexB);
  const [lighter, darker] = la >= lb ? [la, lb] : [lb, la];
  return (lighter + 0.05) / (darker + 0.05);
}

function roleHex(colorMap, role) {
  const value = colorMap[role];
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && typeof value.base === 'string') return value.base;
  return null;
}

export function flattenColors(colorMap) {
  const out = [];
  for (const [role, value] of Object.entries(colorMap)) {
    if (ALPHA_ROLES.has(role)) continue;
    if (typeof value === 'string') out.push(value);
    else if (value && typeof value === 'object') {
      for (const v of Object.values(value)) if (typeof v === 'string') out.push(v);
    }
  }
  return out;
}

export function countColors(colorMap) {
  const set = new Set(flattenColors(colorMap).filter(isHex).map((c) => c.toLowerCase()));
  return set.size;
}

export function validateTheme(doc) {
  const errors = [];
  if (typeof doc !== 'object' || doc === null || Array.isArray(doc)) {
    return ['document is not a JSON object'];
  }
  if (doc.schema !== THEME_SCHEMA_ID) errors.push(`schema must be '${THEME_SCHEMA_ID}', got ${JSON.stringify(doc.schema)}`);
  if (typeof doc.id !== 'string' || !doc.id) errors.push('id must be a non-empty string');
  if (typeof doc.app !== 'string' || !doc.app) errors.push('app must be a non-empty string');

  const extends_ = doc.extends;
  const color = doc.color;
  if (extends_ !== undefined && extends_ !== null) {
    if (typeof extends_ !== 'string') errors.push('extends must be a string path when present');
  } else if (color === undefined || color === null) {
    errors.push("color is required unless 'extends' is set");
  }

  if (color !== undefined && color !== null) {
    if (typeof color !== 'object' || Array.isArray(color)) {
      errors.push('color must be an object');
    } else {
      for (const [role, value] of Object.entries(color)) {
        if (typeof value === 'string') {
          if (!isColorValue(value, role)) {
            errors.push(
              ALPHA_ROLES.has(role)
                ? `color.${role} is not a #rrggbb or #rrggbbaa colour: ${JSON.stringify(value)}`
                : `color.${role} is not a #rrggbb colour: ${JSON.stringify(value)}`
            );
          }
        } else if (value && typeof value === 'object') {
          for (const [variant, v] of Object.entries(value)) {
            if (!isColorValue(v, role)) errors.push(`color.${role}.${variant} is not a #rrggbb colour: ${JSON.stringify(v)}`);
          }
        } else {
          errors.push(`color.${role} must be a string or an object of variants`);
        }
      }
    }
  }

  const frame = doc.frame;
  if (frame !== undefined && frame !== null) {
    if (typeof frame !== 'object' || Array.isArray(frame)) {
      errors.push('frame must be an object');
    } else {
      const style = frame.style;
      if (!['flat', 'pixel-bevel', 'pixel-double'].includes(style)) {
        errors.push(`frame.style must be flat/pixel-bevel/pixel-double, got ${JSON.stringify(style)}`);
      }
      const borderPx = frame.border_px;
      if (!Number.isInteger(borderPx) || borderPx < 0) errors.push('frame.border_px must be a non-negative integer');
      const notch = frame.corner_notch_px ?? 0;
      if (!Number.isInteger(notch) || notch < 0 || notch > 2) errors.push('frame.corner_notch_px must be an integer 0-2');
    }
  }

  const font = doc.font;
  if (font !== undefined && font !== null && (typeof font !== 'object' || Array.isArray(font))) {
    errors.push('font must be an object');
  }
  if (font && typeof font === 'object' && !Array.isArray(font)) {
    const family = font.family;
    if (!Array.isArray(family) || family.length === 0) {
      errors.push('font.family must be a non-empty array (candidate ids, e.g. system font names)');
    }
  }

  const limit = doc.color_count_limit;
  if (limit !== undefined && limit !== null && (!Number.isInteger(limit) || limit <= 0)) {
    errors.push('color_count_limit must be a positive integer when present');
  }

  return errors;
}

export function checkTheme(doc) {
  const errors = validateTheme(doc);
  const contrast = [];
  let colorCount = null;
  let limit = null;
  let colorCountOk = true;

  const color = doc && typeof doc === 'object' ? doc.color : null;
  if (color && typeof color === 'object' && errors.length === 0) {
    for (const [fgRole, bgRole, required, purpose] of PAIR_RULES) {
      const fg = roleHex(color, fgRole);
      const bg = roleHex(color, bgRole);
      if (fg === null || bg === null) continue;
      const ratio = Math.round(contrastRatio(fg, bg) * 1000) / 1000;
      contrast.push({ fgRole, bgRole, fgHex: fg, bgHex: bg, ratio, required, ok: ratio >= required, purpose });
    }
    colorCount = countColors(color);
    limit = doc.color_count_limit ?? KNOWN_LIMITS[doc.id] ?? null;
    if (limit !== null) colorCountOk = colorCount <= limit;
  }

  const ok = errors.length === 0 && contrast.every((c) => c.ok) && colorCountOk;
  return {
    ok,
    schema: (doc && doc.schema) || '',
    contrast,
    colorCount,
    colorCountLimit: limit,
    colorCountOk,
    errors,
  };
}

// (2026-09-27) font_slot: the user's font choice, independent of palette_overrides.
// 'theme-default' uses the active theme's own font.family[0]; 'dotgothic16' always
// switches to DotGothic16 (every theme lists it as an allowed alternative, owner
// decision #68). See theme-kit.js's applyFont()/resolveFontChoice().
export const FONT_SLOTS = ['theme-default', 'dotgothic16'];

// (2026-09-27, owner request) Separate Japanese/Latin font choice, additive to
// font_slot (which stays valid and is migrated into font_ja/font_latin below).
// `id` for the five fonts the kit already shipped (owner decision #73) is kept
// identical to the family name string used throughout font_slot/PIXEL_FONT_STEP
// so existing stored choices (e.g. via a future font_slot->font_ja mapping some
// app writes itself) keep resolving. The eight new ids are kebab-case.
export const FONT_CATALOGUE = [
  { id: 'Misaki', family: 'Misaki', label_en: 'Misaki', label_ja: '美咲フォント', scripts: ['ja', 'latin'] },
  { id: 'k8x12', family: 'k8x12', label_en: 'k8x12', label_ja: 'k8x12', scripts: ['ja', 'latin'] },
  { id: 'PixelMplus12', family: 'PixelMplus12', label_en: 'PixelMplus12', label_ja: 'PixelMplus12', scripts: ['ja', 'latin'] },
  { id: 'DotGothic16', family: 'DotGothic16', label_en: 'DotGothic16', label_ja: 'DotGothic16', scripts: ['ja', 'latin'] },
  { id: 'Roboto', family: 'Roboto', label_en: 'Roboto', label_ja: 'Roboto', scripts: ['latin'] },
  { id: 'biz-udpgothic', family: 'BIZ UDPGothic', label_en: 'BIZ UDPGothic', label_ja: 'BIZ UDPゴシック', scripts: ['ja', 'latin'] },
  { id: 'biz-udgothic', family: 'BIZ UDGothic', label_en: 'BIZ UDGothic', label_ja: 'BIZ UDゴシック', scripts: ['ja', 'latin'] },
  { id: 'noto-sans-jp', family: 'Noto Sans JP', label_en: 'Noto Sans JP', label_ja: 'Noto Sans JP', scripts: ['ja', 'latin'] },
  { id: 'm-plus-1', family: 'M PLUS 1', label_en: 'M PLUS 1', label_ja: 'M PLUS 1', scripts: ['ja', 'latin'] },
  { id: 'm-plus-2', family: 'M PLUS 2', label_en: 'M PLUS 2', label_ja: 'M PLUS 2', scripts: ['ja', 'latin'] },
  { id: 'ibm-plex-sans-jp', family: 'IBM Plex Sans JP', label_en: 'IBM Plex Sans JP', label_ja: 'IBM Plex Sans JP', scripts: ['ja', 'latin'] },
  { id: 'line-seed-jp', family: 'LINE Seed JP', label_en: 'LINE Seed JP', label_ja: 'LINE Seed JP', scripts: ['ja', 'latin'] },
  { id: 'zen-kaku-gothic-new', family: 'Zen Kaku Gothic New', label_en: 'Zen Kaku Gothic New', label_ja: 'Zen角ゴシック New', scripts: ['ja', 'latin'] },
];

/** true if `id` is a usable choice for `script` ('ja'|'latin'): 'theme' always
 *  is (it defers to the theme's own font), otherwise `id` must name a
 *  FONT_CATALOGUE entry that lists `script`. */
export function isValidFontChoice(id, script) {
  if (id === 'theme') return true;
  const entry = FONT_CATALOGUE.find((f) => f.id === id);
  return Boolean(entry && entry.scripts.includes(script));
}

/** Lossless font_slot -> {font_ja, font_latin, font_link} migration (owner
 *  request 2026-09-27): a document already carrying any of the new fields is
 *  read as-is (invalid ids fall back to 'theme'); otherwise the legacy
 *  font_slot is translated ('dotgothic16' -> DotGothic16 for both scripts,
 *  linked; anything else -> 'theme' for both, linked -- the current default
 *  behaviour). Used by both the loadUiSettings() fast path and
 *  migrateSettings() so a validating legacy document is migrated too. */
export function migrateFontFields(doc) {
  const src = doc && typeof doc === 'object' ? doc : {};
  if (src.font_ja !== undefined || src.font_latin !== undefined || src.font_link !== undefined) {
    const ja = src.font_ja ?? 'theme';
    const latin = src.font_latin ?? 'theme';
    return {
      font_ja: isValidFontChoice(ja, 'ja') ? ja : 'theme',
      font_latin: isValidFontChoice(latin, 'latin') ? latin : 'theme',
      font_link: typeof src.font_link === 'boolean' ? src.font_link : true,
    };
  }
  const legacyId = src.font_slot === 'dotgothic16' ? 'DotGothic16' : 'theme';
  return { font_ja: legacyId, font_latin: legacyId, font_link: true };
}

// (2026-09-28, owner request) text_size: a user-chosen scale applied to every
// --ui-fs-* token (tokens.css). 'normal' (1.0) is the default and is what any
// document lacking the field loads as (additive migration, mirrors font_slot).
export const TEXT_SIZES = ['small', 'normal', 'large', 'x-large', 'xx-large'];
export const TEXT_SIZE_SCALE = {
  small: 0.875,
  normal: 1.0,
  large: 1.25,
  'x-large': 1.5,
  'xx-large': 2.0,
};

// (2026-10-04, owner decision via selection window: "文字サイズは滲んでも構わないので
// 数字で細かく設定できるようにしてください" -> all apps, unit px) ui-settings/1
// minor 1: an optional numeric body text size `text_px` (integer 8-48, step 1).
// Additive: the schema id stays 'ui-settings/1' so older readers (this kit's
// earlier copies, palette-check core.py, dot-wavetable's C++ reader) keep loading
// the document; `schema_minor` records which minor wrote it (absent = 0).
//   - text_px present and valid  -> body text renders at text_px; scale = text_px / app base px
//   - text_px absent             -> text_size preset, exactly the same scale as before
//   - both present               -> text_px wins (text_size is kept as the nearest preset
//                                   so an older reader still gets a close size)
//   - text_px invalid            -> validateSettings() error; saveUiSettings() refuses
//                                   (the previous stored value is kept, never clamped)
// Each app has its own normal body px (the kit's tokens.css body is 11px), so the
// base px is configuration passed by the app, not part of the document.
export const UI_SETTINGS_SCHEMA_MINOR = 1;
export const TEXT_PX_MIN = 8;
export const TEXT_PX_MAX = 48;
export const TEXT_PX_STEP = 1;
/** The kit's own normal body size (tokens.css --ui-fs-body). */
export const DEFAULT_BASE_TEXT_PX = 11;

/** true if `value` is an allowed text_px (integer, TEXT_PX_MIN..TEXT_PX_MAX). */
export function isValidTextPx(value) {
  return Number.isInteger(value) && value >= TEXT_PX_MIN && value <= TEXT_PX_MAX;
}

function validBasePx(basePx) {
  return typeof basePx === 'number' && Number.isFinite(basePx) && basePx > 0 ? basePx : DEFAULT_BASE_TEXT_PX;
}

/** The px a text_size preset maps to for an app whose normal body is `basePx`
 *  (round(basePx * scale), kept inside TEXT_PX_MIN..TEXT_PX_MAX). */
export function presetTextPx(preset, basePx = DEFAULT_BASE_TEXT_PX) {
  const scale = TEXT_SIZE_SCALE[preset] ?? 1;
  const px = Math.round(validBasePx(basePx) * scale);
  return Math.min(TEXT_PX_MAX, Math.max(TEXT_PX_MIN, px));
}

/** The preset whose scale is closest to px/basePx (ties go to the smaller preset). */
export function nearestTextSizePreset(px, basePx = DEFAULT_BASE_TEXT_PX) {
  const want = px / validBasePx(basePx);
  let best = 'normal';
  let bestDist = Infinity;
  for (const id of TEXT_SIZES) {
    const d = Math.abs(TEXT_SIZE_SCALE[id] - want);
    if (d < bestDist) { best = id; bestDist = d; }
  }
  return best;
}

/** Resolves the effective body text size of a settings document for an app
 *  whose normal body is `basePx`: {px, scale, preset, source}. `source` is 'px'
 *  when a valid text_px decided it, else 'preset' (scale is then exactly
 *  TEXT_SIZE_SCALE[text_size], i.e. the pre-minor-1 behaviour, and `px` is the
 *  rounded body size). Never throws; an invalid text_px is ignored here (the
 *  validator is what reports it). */
export function resolveTextSize(settings, basePx = DEFAULT_BASE_TEXT_PX) {
  const base = validBasePx(basePx);
  const preset = TEXT_SIZES.includes(settings?.text_size) ? settings.text_size : 'normal';
  if (isValidTextPx(settings?.text_px)) {
    return { px: settings.text_px, scale: settings.text_px / base, preset, source: 'px' };
  }
  return { px: Math.round(base * TEXT_SIZE_SCALE[preset]), scale: TEXT_SIZE_SCALE[preset], preset, source: 'preset' };
}

export const DEFAULT_SETTINGS = {
  schema: UI_SETTINGS_SCHEMA_ID,
  schema_minor: UI_SETTINGS_SCHEMA_MINOR,
  theme: 'modern',
  palette_overrides: {},
  layout: {},
  reduced_motion: false,
  ui_sound: false,
  font_slot: 'theme-default',
  font_ja: 'theme',
  font_latin: 'theme',
  font_link: true,
  text_size: 'normal',
};

export function validateSettings(doc) {
  const errors = [];
  if (typeof doc !== 'object' || doc === null || Array.isArray(doc)) {
    return ['document is not a JSON object'];
  }
  if (doc.schema !== UI_SETTINGS_SCHEMA_ID) errors.push(`schema must be '${UI_SETTINGS_SCHEMA_ID}', got ${JSON.stringify(doc.schema)}`);
  if (typeof doc.theme !== 'string' || !doc.theme) errors.push('theme must be a non-empty string');

  const overrides = doc.palette_overrides ?? {};
  if (typeof overrides !== 'object' || Array.isArray(overrides)) {
    errors.push('palette_overrides must be an object');
  } else {
    for (const [role, value] of Object.entries(overrides)) {
      if (!isHex(value)) errors.push(`palette_overrides.${role} is not a #rrggbb colour: ${JSON.stringify(value)}`);
    }
  }
  const layout = doc.layout ?? {};
  if (typeof layout !== 'object' || Array.isArray(layout)) {
    errors.push('layout must be an object');
  } else {
    // Soft/additive checks (owner decision #78 step 1): only the normalized
    // sections/toolbars/pinned keys are checked when present. Unknown/legacy
    // keys (sectionOrder, toolbarOrder, order, region-keyed objects, ...) are
    // left alone here -- migrateLayout() is what normalizes those, and a
    // document that only carries legacy keys is not itself invalid.
    if (layout.sections !== undefined) {
      if (!Array.isArray(layout.sections) || !layout.sections.every((v) => typeof v === 'string')) {
        errors.push('layout.sections must be an array of strings when present');
      }
    }
    if (layout.toolbars !== undefined) {
      if (typeof layout.toolbars !== 'object' || layout.toolbars === null || Array.isArray(layout.toolbars)) {
        errors.push('layout.toolbars must be an object when present');
      } else {
        for (const [toolbarId, order] of Object.entries(layout.toolbars)) {
          if (!Array.isArray(order) || !order.every((v) => typeof v === 'string')) {
            errors.push(`layout.toolbars.${toolbarId} must be an array of strings`);
          }
        }
      }
    }
    if (layout.pinned !== undefined) {
      if (!Array.isArray(layout.pinned) || !layout.pinned.every((v) => typeof v === 'string')) {
        errors.push('layout.pinned must be an array of strings when present');
      }
    }
  }
  if (typeof (doc.reduced_motion ?? false) !== 'boolean') errors.push('reduced_motion must be a boolean');
  if (typeof (doc.ui_sound ?? false) !== 'boolean') errors.push('ui_sound must be a boolean');
  if (doc.font_slot !== undefined && !FONT_SLOTS.includes(doc.font_slot)) {
    errors.push(`font_slot must be one of ${JSON.stringify(FONT_SLOTS)}, got ${JSON.stringify(doc.font_slot)}`);
  }
  if (doc.font_ja !== undefined && !isValidFontChoice(doc.font_ja, 'ja')) {
    errors.push(`font_ja is not a known Japanese-capable font id: ${JSON.stringify(doc.font_ja)}`);
  }
  if (doc.font_latin !== undefined && !isValidFontChoice(doc.font_latin, 'latin')) {
    errors.push(`font_latin is not a known Latin-capable font id: ${JSON.stringify(doc.font_latin)}`);
  }
  if (doc.font_link !== undefined && typeof doc.font_link !== 'boolean') {
    errors.push('font_link must be a boolean');
  }
  if (doc.text_size !== undefined && !TEXT_SIZES.includes(doc.text_size)) {
    errors.push(`text_size must be one of ${JSON.stringify(TEXT_SIZES)}, got ${JSON.stringify(doc.text_size)}`);
  }
  if (doc.text_px !== undefined && !isValidTextPx(doc.text_px)) {
    errors.push(`text_px must be an integer ${TEXT_PX_MIN}-${TEXT_PX_MAX} (px), got ${JSON.stringify(doc.text_px)}`);
  }
  if (doc.schema_minor !== undefined && (!Number.isInteger(doc.schema_minor) || doc.schema_minor < 0)) {
    errors.push(`schema_minor must be a non-negative integer, got ${JSON.stringify(doc.schema_minor)}`);
  }
  return errors;
}

export function checkSettingsOverrides(doc, baseColor = null) {
  const errors = validateSettings(doc);
  const contrast = [];
  if (errors.length === 0) {
    const merged = { ...(baseColor && typeof baseColor === 'object' ? baseColor : {}) };
    Object.assign(merged, doc.palette_overrides ?? {});
    for (const [fgRole, bgRole, required, purpose] of PAIR_RULES) {
      const fg = roleHex(merged, fgRole);
      const bg = roleHex(merged, bgRole);
      if (fg === null || bg === null) continue;
      const ratio = Math.round(contrastRatio(fg, bg) * 1000) / 1000;
      contrast.push({ fgRole, bgRole, fgHex: fg, bgHex: bg, ratio, required, ok: ratio >= required, purpose });
    }
  }
  const ok = errors.length === 0 && contrast.every((c) => c.ok);
  return {
    ok,
    schema: (doc && doc.schema) || '',
    contrast,
    colorCount: null,
    colorCountLimit: null,
    colorCountOk: true,
    errors,
  };
}

// True if `value` looks like the dot-wavetable C++ shape's per-region array:
// [{button_id, order}, ...] (see projects/dot-wavetable/app/settings/src/ui_settings.cpp
// encode_bytes()). Used only to recognise a *whole* `layout` object keyed by
// region name -> such arrays (no sections/toolbars/sectionOrder/... keys at all),
// which is the one shape migrateLayout() must reinterpret entirely rather than
// merely read one property from.
function isButtonOrderArray(value) {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((item) => item && typeof item === 'object' && typeof item.button_id === 'string')
  );
}

// (2026-09-27, owner decision #78 step 1) Normalizes any app's stored `layout`
// shape into { sections, toolbars, pinned } without dropping order or unknown
// data. Known legacy shapes read here:
//   - layout.sectionOrder: string[]      (UIChime, Tabularium)          -> sections
//   - layout.order: string[]             (Melodia)                     -> sections
//   - layout.toolbarOrder: string[]      (Recensio, dot-soundtest)       -> toolbars.main
//   - layout.toolbars: {id: string[]}    (already normalized)          -> kept
//   - layout.sections: string[]          (already normalized)          -> kept
//   - a whole layout object keyed by region -> [{button_id, order}]     -> toolbars.<region>
//     (dot-wavetable's ui_settings.cpp; read-only reference, not migrated in place --
//     this only lets a document written in that shape load losslessly elsewhere.)
// Legacy keys are left in the output alongside the normalized ones (additive:
// older app code reading its own historical key keeps working) except for the
// region-keyed whole-object shape, which *is* the object (nothing else to keep).
export function migrateLayout(rawLayout) {
  if (typeof rawLayout !== 'object' || rawLayout === null || Array.isArray(rawLayout)) return {};

  const keys = Object.keys(rawLayout);
  const hasKnownKey = keys.some((k) =>
    ['sections', 'toolbars', 'sectionOrder', 'toolbarOrder', 'order', 'pinned'].includes(k)
  );
  if (!hasKnownKey && keys.length > 0 && keys.every((k) => isButtonOrderArray(rawLayout[k]))) {
    // Whole object is the dot-wavetable region-keyed shape: region -> [{button_id, order}].
    const toolbars = {};
    for (const [region, entries] of Object.entries(rawLayout)) {
      const sorted = entries
        .slice()
        .map((e, i) => ({ ...e, i }))
        .sort((a, b) => (a.order - b.order) || a.i - b.i || (a.button_id < b.button_id ? -1 : 1));
      toolbars[region] = sorted.map((e) => e.button_id);
    }
    return { toolbars };
  }

  const out = structuredClone(rawLayout);

  let sections = Array.isArray(rawLayout.sections) ? rawLayout.sections.filter((v) => typeof v === 'string') : null;
  if (!sections && Array.isArray(rawLayout.sectionOrder)) {
    sections = rawLayout.sectionOrder.filter((v) => typeof v === 'string');
  }
  if (!sections && Array.isArray(rawLayout.order)) {
    sections = rawLayout.order.filter((v) => typeof v === 'string');
  }
  if (sections) out.sections = sections;

  const toolbars =
    rawLayout.toolbars && typeof rawLayout.toolbars === 'object' && !Array.isArray(rawLayout.toolbars)
      ? { ...rawLayout.toolbars }
      : {};
  if (!toolbars.main && Array.isArray(rawLayout.toolbarOrder)) {
    toolbars.main = rawLayout.toolbarOrder.filter((v) => typeof v === 'string');
  }
  if (Object.keys(toolbars).length > 0) out.toolbars = toolbars;

  if (Array.isArray(rawLayout.pinned)) {
    out.pinned = rawLayout.pinned.filter((v) => typeof v === 'string');
  }

  return out;
}

export function migrateSettings(doc) {
  if (typeof doc !== 'object' || doc === null || Array.isArray(doc)) {
    return structuredClone(DEFAULT_SETTINGS);
  }
  const out = structuredClone(DEFAULT_SETTINGS);
  if (typeof doc.theme === 'string' && doc.theme) out.theme = doc.theme;

  const overrides = doc.palette_overrides;
  if (overrides && typeof overrides === 'object' && !Array.isArray(overrides)) {
    const clean = {};
    for (const [role, value] of Object.entries(overrides)) if (isHex(value)) clean[role] = value;
    out.palette_overrides = clean;
  }

  const layout = doc.layout;
  if (layout && typeof layout === 'object' && !Array.isArray(layout)) out.layout = migrateLayout(layout);

  if (typeof doc.reduced_motion === 'boolean') out.reduced_motion = doc.reduced_motion;
  if (typeof doc.ui_sound === 'boolean') out.ui_sound = doc.ui_sound;

  // Optional keys added 2026-09-27 (additive): only carried over when valid.
  if (typeof doc.sub_palette === 'string' && doc.sub_palette) out.sub_palette = doc.sub_palette;
  if (doc.hemisphere === 'north' || doc.hemisphere === 'south') out.hemisphere = doc.hemisphere;
  if (FONT_SLOTS.includes(doc.font_slot)) out.font_slot = doc.font_slot;
  Object.assign(out, migrateFontFields(doc));
  if (TEXT_SIZES.includes(doc.text_size)) out.text_size = doc.text_size;
  // ui-settings/1 minor 1 (2026-10-04): carried over only when valid; an
  // invalid text_px is dropped so the document falls back to text_size.
  if (isValidTextPx(doc.text_px)) out.text_px = doc.text_px;

  return out;
}
