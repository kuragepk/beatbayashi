/* Shiroko UI System web kit — theme-kit.js: apply/list/store the 15 preset UI
 * themes (owner decisions #70-71, 2026-09-27) in any dependency-free web app.
 * 依存: なし (素の ES モジュール、ブラウザの fetch/localStorage/matchMedia のみ使用)。
 * 来歴: 新規作成 (2026-09-27, シロコ委任エージェント)。
 * 仕様: docs/design/DESIGN_20260926d_retro_ui_themes.md (机上 Claude-Code リポジトリ)。
 *
 * This is the single source. Consumer apps receive a synced copy via
 * bin/sync-web-kit.mjs and must not hand-edit their copy (edit here, re-sync,
 * re-run the app's own sync-check).
 *
 * Functions here are pure where practical (take a `catalogue` array and a
 * `root` element as parameters) so they can be unit-tested with node --test
 * without a DOM, and re-used by apps whose own theme id list is a superset of
 * the shared 15 (e.g. Recensio adds its colourless "retro-ux").
 */

import {
  DEFAULT_SETTINGS, validateSettings, migrateSettings, migrateLayout, checkSettingsOverrides,
  resolveThemeId, THEME_ID_ALIASES, FONT_SLOTS, FONT_CATALOGUE, isValidFontChoice, migrateFontFields,
  TEXT_SIZES, TEXT_SIZE_SCALE,
  UI_SETTINGS_SCHEMA_MINOR, TEXT_PX_MIN, TEXT_PX_MAX, TEXT_PX_STEP, DEFAULT_BASE_TEXT_PX,
  isValidTextPx, presetTextPx, nearestTextSizePreset, resolveTextSize,
} from './theme-check.js';
import { SEASONS, HEMISPHERES, seasonForDate, chooseSubPalette } from './season.js';

export {
  DEFAULT_SETTINGS, validateSettings, migrateSettings, migrateLayout, checkSettingsOverrides,
  resolveThemeId, THEME_ID_ALIASES, SEASONS, HEMISPHERES, seasonForDate, chooseSubPalette,
  FONT_SLOTS, FONT_CATALOGUE, isValidFontChoice, migrateFontFields,
  TEXT_SIZES, TEXT_SIZE_SCALE,
  UI_SETTINGS_SCHEMA_MINOR, TEXT_PX_MIN, TEXT_PX_MAX, TEXT_PX_STEP, DEFAULT_BASE_TEXT_PX,
  isValidTextPx, presetTextPx, nearestTextSizePreset, resolveTextSize,
};

/** Version of the web kit as a whole (semver; see ../CHANGELOG.md). Apps can
 *  log or assert it after a sync. */
export const KIT_VERSION = '1.3.0';

export const CATALOGUE_SCHEMA_ID = 'ui-theme-catalogue/1';

/** Loads themes-catalogue.json relative to `baseUrl` (a module URL, typically
 *  `import.meta.url` of the caller). Browser-only (uses fetch); for node --test,
 *  read the JSON file directly instead and pass its `.themes` array to the
 *  other functions here. */
export async function fetchCatalogue(baseUrl, fileName = 'themes-catalogue.json') {
  const url = new URL(fileName, baseUrl);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`could not load ${url}: ${res.status}`);
  const doc = await res.json();
  if (doc.schema !== CATALOGUE_SCHEMA_ID) {
    throw new Error(`unexpected catalogue schema: ${JSON.stringify(doc.schema)}`);
  }
  return doc.themes;
}

/** Normalizes a catalogue entry list for display: [{id, ja, en, category, subPalettes, fontFamily}]. */
export function listThemes(catalogue) {
  return catalogue.map((t) => ({
    id: t.id,
    ja: t.label?.ja ?? t.id,
    en: t.label?.en ?? t.id,
    category: t.category ?? 'standard',
    subPalettes: t.subPalettes ?? [],
    fontFamily: t.fontFamily ?? [],
  }));
}

function catalogueEntry(catalogue, themeId) {
  const resolved = resolveThemeId(themeId);
  return catalogue.find((t) => t.id === resolved) ?? null;
}

/** Applies data-theme (and data-sub-palette, for a theme with sub_palettes) to
 *  `root` (typically document.documentElement). `opts.date` defaults to `new
 *  Date()`; pass a fixed date in tests for determinism. An explicit
 *  `opts.subPalette` always wins over the date rule (chooseSubPalette()'s
 *  `override` parameter). */
export function applyTheme(root, catalogue, themeId, opts = {}) {
  const resolved = resolveThemeId(themeId);
  root.setAttribute('data-theme', resolved);
  const entry = catalogueEntry(catalogue, themeId);
  if (entry && entry.subPalettes && entry.subPalettes.length > 0) {
    const date = opts.date ?? new Date();
    const hemisphere = opts.hemisphere ?? 'north';
    const sub = chooseSubPalette(date, hemisphere, opts.subPalette ?? null);
    root.setAttribute('data-sub-palette', sub);
  } else {
    root.removeAttribute('data-sub-palette');
  }
  return resolved;
}

/** true if the OS/browser requests reduced motion. Browser-only. */
export function prefersReducedMotion() {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** settings.reduced_motion OR the OS preference (§4: either one is enough). */
export function effectiveReducedMotion(settings) {
  return Boolean(settings?.reduced_motion) || prefersReducedMotion();
}

/** Sets data-reduced-motion on `root`, consumed by themes.css / an app's own CSS. */
export function applyReducedMotion(root, settings) {
  root.setAttribute('data-reduced-motion', String(effectiveReducedMotion(settings)));
}

/** Reads ui-settings/1 from localStorage at `storageKey`, migrating any older/
 *  unversioned or corrupt shape to the current schema (never throws, never
 *  blocks startup -- mirrors core.migrate_settings()'s contract). */
export function loadUiSettings(storageKey) {
  if (typeof localStorage === 'undefined') return structuredClone(DEFAULT_SETTINGS);
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return structuredClone(DEFAULT_SETTINGS);
    const parsed = JSON.parse(raw);
    // A legacy layout shape (e.g. layout.order) still validates, so always
    // normalise layout even when the document is otherwise valid.
    if (validateSettings(parsed).length === 0) {
      // Font fields are migrated even on this fast path (owner request
      // 2026-09-27): a legacy font_slot-only document validates as-is, but
      // must still gain font_ja/font_latin/font_link losslessly. text_size
      // (owner request 2026-09-28) is additive the same way: a document
      // predating the field validates as-is but must still default to 'normal'.
      return {
        ...parsed,
        layout: migrateLayout(parsed.layout ?? {}),
        ...migrateFontFields(parsed),
        text_size: TEXT_SIZES.includes(parsed.text_size) ? parsed.text_size : 'normal',
      };
    }
    return migrateSettings(parsed);
  } catch {
    return structuredClone(DEFAULT_SETTINGS);
  }
}

/** Validates + (for palette_overrides) contrast-checks before writing to
 *  localStorage. `baseColor` is the active theme's role->hex map (e.g. read
 *  from the rendered --theme-color-* custom properties). Returns
 *  {ok, errors, report}; only persists when ok. */
export function saveUiSettings(storageKey, doc, baseColor) {
  const errors = validateSettings(doc);
  if (errors.length > 0) return { ok: false, errors, report: null };
  const overrides = doc.palette_overrides ?? {};
  const full = baseColor ?? {};
  const checkBase = { surface: full.surface };
  for (const role of Object.keys(overrides)) {
    if (role !== 'surface' && full[role] !== undefined) checkBase[role] = full[role];
  }
  const report = checkSettingsOverrides(doc, checkBase);
  if (!report.ok) return { ok: false, errors: [], report };
  if (typeof localStorage !== 'undefined') localStorage.setItem(storageKey, JSON.stringify(doc));
  return { ok: true, errors: [], report };
}

export function resetUiSettings(storageKey) {
  if (typeof localStorage !== 'undefined') localStorage.removeItem(storageKey);
  return structuredClone(DEFAULT_SETTINGS);
}

/** Reads the current role->hex map from CSS custom properties
 *  (--theme-color-<role>, as written by web/themes.css) for `root`. Used as
 *  `baseColor` for saveUiSettings()'s contrast gate. Browser-only. */
export function currentThemeColor(root, roles = ['surface', 'text', 'accent', 'border', 'focus', 'danger', 'ok', 'selection']) {
  if (typeof getComputedStyle === 'undefined') return {};
  const style = getComputedStyle(root);
  const out = {};
  for (const role of roles) {
    const v = style.getPropertyValue(`--theme-color-${role}`).trim();
    if (v) out[role] = v;
  }
  return out;
}

/** The custom property every generated theme's font stack is written to
 *  (web/themes.css); font FILES are never bundled by the kit, only names. */
export const FONT_FAMILY_VAR = '--theme-font-family';

/** The custom property applyFont() writes the active pixel font's integer
 *  size step to (an app's own CSS reads this for its base font-size); unset
 *  for themes/choices that resolve to a system font stack. */
export const FONT_SIZE_STEP_VAR = '--theme-font-size-step';

// Bitmap font ids the kit ships (templates/ui-system/fonts/manifest.json) and their
// pixel-friendly size step: an integer multiple of the font's native pixel size
// (Misaki is drawn at 8px so its readable step is 16px; k8x12/PixelMplus12/DotGothic16
// are already legible at their own native size). Modern's system font stack is not
// listed here and keeps an app's own font-size (no pixel stepping).
export const PIXEL_FONT_STEP = {
  Misaki: 16,
  k8x12: 12,
  PixelMplus12: 12,
  DotGothic16: 16,
};

const SYSTEM_FONT_STACK = 'Segoe UI, Tahoma, Geneva, Verdana, sans-serif';

/** true if `name` is one of the bundled bitmap font ids. */
export function isPixelFont(name) {
  return Object.prototype.hasOwnProperty.call(PIXEL_FONT_STEP, name);
}

function fontStackFor(name) {
  return isPixelFont(name) ? `"${name}", "DotGothic16", ${SYSTEM_FONT_STACK}` : name;
}

/** Resolves which font id a catalogue `entry` (from listThemes()/themes-catalogue.json,
 *  i.e. an entry carrying `fontFamily: [default, ...candidates]`) should render with,
 *  given the user's `fontSlot` ('theme-default' default, or 'dotgothic16' -- owner
 *  decision #68: DotGothic16 is always an allowed alternative). Falls back to the
 *  theme's own first candidate when the slot is invalid or unavailable. */
export function resolveFontChoice(entry, fontSlot) {
  const stack = entry?.fontFamily ?? [];
  const primary = stack[0] ?? null;
  if (fontSlot === 'dotgothic16' && stack.includes('DotGothic16')) return 'DotGothic16';
  return primary;
}

/** Applies the active theme+font_slot's font choice to `root`: writes
 *  FONT_FAMILY_VAR (and, for a bitmap font, FONT_SIZE_STEP_VAR) via root.style
 *  when available, and sets data-font-pixel="true" so CSS (fonts.css) can turn
 *  off subpixel antialiasing for the bitmap look. `settings` is a loaded
 *  ui-settings/1 document (or any object carrying `font_slot`); modern/system
 *  fonts are left to the app's own CSS (no pixel stepping, smoothing untouched).
 *  Returns {family, chosen, pixel} or null if the theme has no font entry. */
export function applyFont(root, catalogue, themeId, settings = {}) {
  const entry = catalogueEntry(catalogue, themeId);
  const chosen = entry ? resolveFontChoice(entry, settings.font_slot) : null;
  if (!chosen) {
    root.removeAttribute?.('data-font-pixel');
    return null;
  }
  const family = fontStackFor(chosen);
  const step = PIXEL_FONT_STEP[chosen] ?? null;
  if (root.style && typeof root.style.setProperty === 'function') {
    root.style.setProperty(FONT_FAMILY_VAR, family);
    if (step) root.style.setProperty(FONT_SIZE_STEP_VAR, `${step}px`);
    else if (typeof root.style.removeProperty === 'function') root.style.removeProperty(FONT_SIZE_STEP_VAR);
  }
  if (typeof root.setAttribute === 'function') {
    if (step) root.setAttribute('data-font-pixel', 'true');
    else root.removeAttribute?.('data-font-pixel');
  }
  return { family, chosen, pixel: Boolean(step) };
}

// --- separate Japanese/Latin font choice (owner request 2026-09-27) -------
// Additive to font_slot/applyFont() above (still used as-is by any existing
// caller); these are the new entry points settings UIs should switch to.

/** The custom property applyFontChoice() writes the combined Latin+Japanese
 *  font stack to. Distinct from FONT_FAMILY_VAR (font_slot's single-font var,
 *  left untouched for backward compatibility). */
export const UI_FONT_FAMILY_VAR = '--ui-font-family';

function scriptFamily(entry, settings, script) {
  const key = script === 'ja' ? 'font_ja' : 'font_latin';
  const id = settings?.[key] ?? 'theme';
  if (id !== 'theme') {
    const found = FONT_CATALOGUE.find((f) => f.id === id && f.scripts.includes(script));
    if (found) return found.family;
  }
  const chosen = entry ? resolveFontChoice(entry, settings?.font_slot) : null;
  return chosen ?? (script === 'ja' ? 'DotGothic16' : 'Segoe UI');
}

/** Resolves settings.font_ja/font_latin (falling back to the theme's own
 *  font_slot-resolved choice for 'theme') and writes
 *  `"<latin family>", "<ja family>", <theme fallback stack>` to
 *  UI_FONT_FAMILY_VAR on `root`. Also calls applyFont() for its side effects
 *  (FONT_FAMILY_VAR / FONT_SIZE_STEP_VAR / data-font-pixel), so a consumer
 *  only needs to call this one function. Returns {family, ja, latin}. */
export function applyFontChoice(root, catalogue, themeId, settings = {}) {
  const entry = catalogueEntry(catalogue, themeId);
  const legacy = applyFont(root, catalogue, themeId, settings);
  const latin = scriptFamily(entry, settings, 'latin');
  const ja = scriptFamily(entry, settings, 'ja');
  const themeFallback = legacy ? legacy.family : SYSTEM_FONT_STACK;
  const family = `"${latin}", "${ja}", ${themeFallback}`;
  if (root.style && typeof root.style.setProperty === 'function') {
    root.style.setProperty(UI_FONT_FAMILY_VAR, family);
  }
  return { family, ja, latin };
}

/** Pure helper for a settings UI: returns a new settings object with
 *  font_ja/font_latin updated per `{script, id}`. When settings.font_link is
 *  true (default), the other script's field is set to `id` too, but only if
 *  `id` is a valid choice for that script (e.g. picking Roboto, latin-only,
 *  while linked leaves font_ja untouched -- the UI is expected to only offer
 *  Roboto in the unlinked font_latin select in the first place). */
export function setFontChoice(settings, { script, id }) {
  const out = { ...settings };
  const key = script === 'ja' ? 'font_ja' : 'font_latin';
  out[key] = id;
  const linked = settings?.font_link ?? true;
  if (linked) {
    const otherScript = script === 'ja' ? 'latin' : 'ja';
    const otherKey = otherScript === 'ja' ? 'font_ja' : 'font_latin';
    if (isValidFontChoice(id, otherScript)) out[otherKey] = id;
  }
  return out;
}

/** Sets settings.font_link, and (when turning linking on) syncs font_latin to
 *  font_ja's current value if that's a valid Latin choice, else leaves both
 *  as they are (both fields keep their own value; linking only takes effect
 *  on the next setFontChoice() call if the values can't be reconciled now). */
export function setFontLink(settings, linked) {
  const out = { ...settings, font_link: Boolean(linked) };
  if (linked && isValidFontChoice(settings?.font_ja, 'latin')) out.font_latin = settings.font_ja;
  return out;
}

/** Plain-data descriptor for a font-choice settings UI (owner request
 *  2026-09-27): a link checkbox, then one select (both scripts share it) when
 *  linked, or two selects (Japanese, then English) when not. Labels are
 *  {label_en, label_ja} pairs, English first per the owner's phrasing order.
 *  Does not touch the DOM; the caller renders it however its own app does. */
export function fontSettingsModel(settings, catalogue = FONT_CATALOGUE) {
  const linked = settings?.font_link ?? true;
  const themeOption = { id: 'theme', label_en: 'Theme default', label_ja: 'テーマの既定' };
  const optionsFor = (...scripts) => [
    themeOption,
    ...catalogue
      .filter((f) => scripts.every((s) => f.scripts.includes(s)))
      .map((f) => ({ id: f.id, label_en: f.label_en, label_ja: f.label_ja })),
  ];
  const checkbox = {
    id: 'font_link',
    label_en: 'Same font for Japanese and English',
    label_ja: '日本語と英語で同じフォント',
    checked: linked,
  };
  if (linked) {
    return {
      checkbox,
      selects: [
        {
          script: 'both', id: 'font_both', label_en: 'Font', label_ja: 'フォント',
          value: settings?.font_ja ?? 'theme', options: optionsFor('ja', 'latin'),
        },
      ],
    };
  }
  return {
    checkbox,
    selects: [
      {
        script: 'ja', id: 'font_ja', label_en: 'Japanese font', label_ja: '日本語のフォント',
        value: settings?.font_ja ?? 'theme', options: optionsFor('ja'),
      },
      {
        script: 'latin', id: 'font_latin', label_en: 'English font', label_ja: '英語のフォント',
        value: settings?.font_latin ?? 'theme', options: optionsFor('latin'),
      },
    ],
  };
}

// --- layout ordering (owner decision #78 step 1) --------------------------
// `settings.layout` shape (ui-settings/1, additive): { sections: string[],
// toolbars: { [toolbarId]: string[] }, pinned: string[] }. An app's own
// migrateLayout()-normalized settings (loadUiSettings() already runs this via
// migrateSettings() for anything not already valid) are the input here; these
// helpers do not read localStorage themselves.

/** Shared ordering rule for both orderedSections() and orderedToolbar():
 *  unknown ids (not in `defaultIds`) are dropped, ids missing from `order`
 *  are appended in their default-order position, and any `pinned` id that is
 *  also a known default id is never dropped from the result (it can move,
 *  per moveItem(), but this function alone never removes it). */
export function orderedIds(order, defaultIds, pinned = []) {
  const knownIds = Array.isArray(defaultIds) ? defaultIds : [];
  const known = new Set(knownIds);
  const source = Array.isArray(order) ? order : [];
  const kept = source.filter((id) => known.has(id));
  for (const id of knownIds) if (!kept.includes(id)) kept.push(id);
  if (Array.isArray(pinned)) {
    for (const id of pinned) if (known.has(id) && !kept.includes(id)) kept.push(id);
  }
  return kept;
}

/** `settings.layout.sections`, reconciled against `defaultSections` (this
 *  app's own default section id list, in default order). */
export function orderedSections(settings, defaultSections) {
  const layout = settings?.layout ?? {};
  return orderedIds(layout.sections, defaultSections, layout.pinned);
}

/** `settings.layout.toolbars[toolbarId]`, reconciled against
 *  `defaultToolbarIds` (this toolbar's own default button/item id list, in
 *  default order). Apps with a single toolbar can use any fixed `toolbarId`
 *  (e.g. `'main'` -- the id migrateLayout() assigns a migrated legacy
 *  `toolbarOrder` to). */
export function orderedToolbar(settings, toolbarId, defaultToolbarIds) {
  const layout = settings?.layout ?? {};
  const order = layout.toolbars && typeof layout.toolbars === 'object' ? layout.toolbars[toolbarId] : undefined;
  return orderedIds(order, defaultToolbarIds, layout.pinned);
}

/** Swaps `id` with its neighbour in `dir` (-1 up/left, +1 down/right) within
 *  `list`, returning a new array. Returns a copy of `list` unchanged if `id`
 *  is absent or already at that edge -- never throws, safe to call from a
 *  button's onClick without a bounds check first. Pure; does not persist. */
export function moveItem(list, id, dir) {
  const items = Array.isArray(list) ? list.slice() : [];
  const i = items.indexOf(id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= items.length) return items;
  [items[i], items[j]] = [items[j], items[i]];
  return items;
}

// --- text size / accessibility zoom (owner request 2026-09-28) ------------
// settings.text_size scales every --ui-fs-* token (tokens.css). Additive to
// ui-settings/1; TEXT_SIZES/TEXT_SIZE_SCALE/text_size validation+migration
// live in theme-check.js (re-exported above), symmetric with FONT_SLOTS.

/** The custom property applyTextSize() writes the active scale factor to
 *  (a plain number as a string, e.g. "1.25"), in case an app's own CSS wants
 *  to scale something other than a --ui-fs-* token (e.g. an icon glyph). */
export const TEXT_SCALE_VAR = '--ui-text-scale';

// tokens.css's own --ui-fs-* values (px), keyed by the suffix after "--ui-fs-".
// The default `baseSizes` argument to computeScaledFontSizes()/applyTextSize();
// an app that overrides --ui-fs-* locally (Melodia's own +4px file, dot-soundtest's
// fontScale.ts) passes its own base map instead so the scale composes with that
// app's base rather than the shared kit's.
export const BASE_FONT_SIZES_PX = {
  'caption-sm': 9,
  caption: 10,
  body: 11,
  button: 12,
  label: 13,
  cta: 14,
  h2: 15,
  h1: 22,
};

// Native pixel grid (px) of each bundled bitmap font, i.e. the size a glyph is
// actually drawn at before any integer upscale -- distinct from PIXEL_FONT_STEP
// above (that's the *readable* minimum step for the default/unscaled UI, which
// for Misaki is 2x its 8px grid). Owner spec 2026-09-28: Misaki 8px grid,
// k8x12/PixelMplus12 12px grid, DotGothic16 16px grid.
export const PIXEL_FONT_GRID = {
  Misaki: 8,
  k8x12: 12,
  PixelMplus12: 12,
  DotGothic16: 16,
};

// Snaps `sizePx` (already scale*base, rounded to the nearest integer px) to a
// multiple of `grid`. Rule (owner spec 2026-09-28): for scale >= 1 the snapped
// size must stay >= the unsnapped scaled size (round UP to the next grid line,
// never shrinking a magnified size below what the user asked for); for scale <
// 1 it must stay <= the unsnapped scaled size (round DOWN, so a shrunk size
// never exceeds it); the result is never below one grid step regardless of
// direction (a pixel font always renders at least one full glyph cell).
function snapToPixelGrid(sizePx, grid, scale) {
  if (!grid || grid <= 0) return sizePx;
  const snapped = scale >= 1 ? Math.ceil(sizePx / grid) * grid : Math.floor(sizePx / grid) * grid;
  return Math.max(snapped, grid);
}

/** Pure: { [tokenKey]: scaledPx } for every key in `baseSizes` (default
 *  BASE_FONT_SIZES_PX), given a scale factor. Owner decision 2026-09-28
 *  (selection window): text-size scaling is always plain round(base*scale) --
 *  blur/smooth scaling, no pixel-font grid snapping, even when a pixel font
 *  is active. `grid` is accepted for backward-compatible call sites but is no
 *  longer used to snap the result; PIXEL_FONT_GRID/snapToPixelGrid remain
 *  exported/defined for other callers that still want grid data. Does not
 *  touch the DOM. */
export function computeScaledFontSizes(baseSizes, scale, grid = null) {
  const out = {};
  for (const [key, basePx] of Object.entries(baseSizes)) {
    out[key] = Math.round(basePx * scale);
  }
  return out;
}

// Which pixel-font grid (if any) is currently active for `themeId`+`settings`,
// mirroring applyFontChoice()'s own font resolution (scriptFamily()) so the
// snapping grid always matches what's actually rendered. Latin takes priority
// when both scripts resolve to (different) pixel fonts -- font_link's default
// keeps them equal in practice; an app that unlinks them keeps crisp Latin
// text as the deciding factor since it is usually the denser/smaller script
// in a mixed UI.
function activePixelGrid(catalogue, themeId, settings) {
  const entry = catalogueEntry(catalogue, themeId);
  const latin = scriptFamily(entry, settings, 'latin');
  const ja = scriptFamily(entry, settings, 'ja');
  return PIXEL_FONT_GRID[latin] ?? PIXEL_FONT_GRID[ja] ?? null;
}

/** Applies the body text size to `root`: writes TEXT_SCALE_VAR and a
 *  `--ui-fs-<key>` custom property per entry of `baseSizes` (default
 *  BASE_FONT_SIZES_PX, i.e. tokens.css's own values -- pass an app's own base
 *  map to compose with a local override file).
 *
 *  ui-settings/1 minor 1 (2026-10-04): a valid `settings.text_px` wins and the
 *  scale is text_px / basePx, where basePx is `opts.basePx` (the app's normal
 *  body px), else `baseSizes.body`, else 11. Without text_px the scale is
 *  exactly TEXT_SIZE_SCALE[text_size] ('normal' for a missing/invalid value),
 *  the same as before minor 1 -- the default look does not change.
 *
 *  Scaling is plain round(base*scale) for every font, pixel or not (owner
 *  decisions 2026-09-28 and 2026-10-04: blur is accepted, no grid snapping).
 *  `grid` is still returned for callers that want to know which pixel font is
 *  active. Returns { size, scale, grid, sizes, px, basePx, source } (no DOM
 *  side effect when `root.style` is unavailable, e.g. under node --test). */
export function applyTextSize(root, settings, catalogue, baseSizes = BASE_FONT_SIZES_PX, opts = {}) {
  const basePx = opts.basePx ?? baseSizes?.body ?? DEFAULT_BASE_TEXT_PX;
  const resolved = resolveTextSize(settings, basePx);
  const { scale } = resolved;
  const grid = activePixelGrid(catalogue ?? [], settings?.theme, settings ?? {});
  const sizes = computeScaledFontSizes(baseSizes, scale, grid);
  if (root && root.style && typeof root.style.setProperty === 'function') {
    root.style.setProperty(TEXT_SCALE_VAR, String(scale));
    for (const [key, px] of Object.entries(sizes)) {
      root.style.setProperty(`--ui-fs-${key}`, `${px}px`);
    }
  }
  return { size: resolved.preset, scale, grid, sizes, px: resolved.px, basePx, source: resolved.source };
}

const TEXT_SIZE_LABELS = {
  small: { label_en: 'Small', label_ja: '小さめ' },
  normal: { label_en: 'Normal', label_ja: '標準' },
  large: { label_en: 'Large', label_ja: '大きめ' },
  'x-large': { label_en: 'Extra large', label_ja: '特大' },
  'xx-large': { label_en: 'Largest', label_ja: '最大' },
};

/** Plain-data descriptor for a "Text size / 文字の大きさ" settings UI, same
 *  shape family as fontSettingsModel(). Fields from before minor 1 are kept
 *  (id, label_en, label_ja, value, options[{id,label_en,label_ja}]); minor 1
 *  adds the numeric part: px/min/max/step/scale/basePx/source, `preset` (the
 *  preset whose px equals the current px, or null for a custom value) and
 *  `px` on every option. `opts.basePx` is the app's normal body px (default 11). */
export function textSizeSettingsModel(settings, opts = {}) {
  const basePx = opts.basePx ?? DEFAULT_BASE_TEXT_PX;
  const resolved = resolveTextSize(settings, basePx);
  const options = TEXT_SIZES.map((id) => ({ id, ...TEXT_SIZE_LABELS[id], px: presetTextPx(id, basePx) }));
  const match = resolved.source === 'px' ? options.find((o) => o.px === resolved.px) : options.find((o) => o.id === resolved.preset);
  return {
    id: 'text_size',
    label_en: 'Text size',
    label_ja: '文字の大きさ',
    value: resolved.preset,
    options,
    px: resolved.px,
    min: TEXT_PX_MIN,
    max: TEXT_PX_MAX,
    step: TEXT_PX_STEP,
    unit: 'px',
    scale: resolved.scale,
    basePx,
    source: resolved.source,
    preset: match ? match.id : null,
  };
}

/** Pure: sets the numeric body size. Returns {ok, settings, errors}. On an
 *  invalid px (not an integer TEXT_PX_MIN..TEXT_PX_MAX) ok is false and
 *  `settings` is the input unchanged (the previous value is kept, never
 *  clamped). On success text_size is set to the nearest preset (so an older
 *  reader of the same document still lands close) and schema_minor is raised
 *  to UI_SETTINGS_SCHEMA_MINOR. */
export function setTextPx(settings, px, opts = {}) {
  if (!isValidTextPx(px)) {
    return {
      ok: false,
      settings,
      errors: [`text_px must be an integer ${TEXT_PX_MIN}-${TEXT_PX_MAX} (px), got ${JSON.stringify(px)}`],
    };
  }
  const basePx = opts.basePx ?? DEFAULT_BASE_TEXT_PX;
  const next = {
    ...settings,
    schema_minor: Math.max(UI_SETTINGS_SCHEMA_MINOR, Number.isInteger(settings?.schema_minor) ? settings.schema_minor : 0),
    text_px: px,
    text_size: nearestTextSizePreset(px, basePx),
  };
  return { ok: true, settings: next, errors: [] };
}

/** Pure: a preset quick-button. Sets text_size to `preset` and text_px to the
 *  px it maps to for this app (presetTextPx(preset, basePx)). Unknown preset
 *  -> {ok:false, settings unchanged}. */
export function setTextSizePreset(settings, preset, opts = {}) {
  if (!TEXT_SIZES.includes(preset)) {
    return { ok: false, settings, errors: [`text_size must be one of ${JSON.stringify(TEXT_SIZES)}, got ${JSON.stringify(preset)}`] };
  }
  const basePx = opts.basePx ?? DEFAULT_BASE_TEXT_PX;
  const res = setTextPx(settings, presetTextPx(preset, basePx), { basePx });
  if (res.ok) res.settings.text_size = preset;
  return res;
}

/** Default preview samples for the text-size control (owner request
 *  2026-10-04): Japanese (hiragana, katakana, kanji), Latin, digits. No emoji
 *  and no symbol a bundled pixel font may lack; apps pass their own UI words. */
export const DEFAULT_TEXT_PREVIEW_SAMPLES = ['あいう アイウ 漢字 ABC abc 0123'];

/** The font families a service actually renders with, for the text-size
 *  preview: the active Latin and Japanese choices (applyFontChoice()'s own
 *  resolution of font_latin/font_ja/theme), the theme's own first font, then
 *  any app `extra` fonts ({name, family} -- headings, monospace, a display
 *  font). Deduplicated by name, in that order. Each entry is {name, family}
 *  where `family` is a CSS font-family value. Pure; no DOM. */
export function textPreviewFonts(catalogue, themeId, settings = {}, extra = []) {
  const entry = catalogueEntry(catalogue ?? [], themeId);
  const out = [];
  const seen = new Set();
  const add = (name, family) => {
    if (!name || seen.has(name)) return;
    seen.add(name);
    out.push({ name, family: family ?? fontStackFor(name) });
  };
  add(scriptFamily(entry, settings, 'latin'));
  add(scriptFamily(entry, settings, 'ja'));
  const themeFirst = entry?.fontFamily?.[0];
  if (themeFirst) add(themeFirst);
  for (const f of Array.isArray(extra) ? extra : []) {
    if (f && typeof f.name === 'string') add(f.name, typeof f.family === 'string' ? f.family : undefined);
  }
  return out;
}
