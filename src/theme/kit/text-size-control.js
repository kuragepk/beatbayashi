/* Shiroko UI System web kit — text-size-control.js: the shared "Text size /
 * 文字の大きさ" settings control (ui-settings/1 minor 1, text_px 8-48 px).
 * 依存: ./theme-kit.js のみ (素の ES モジュール、DOM API は呼び出し側の document)。
 * 来歴: 新規作成 (2026-10-04, シロコ委任エージェント)。
 *   改訂 2026-10-04T09:18Z (UTC) / 18:18 JST (kit 1.2.0): handle.update({settings, fonts, samples})
 *   と opts.fontsFor を追加。テーマ・フォントの選択が変わったとき、設定画面を作り直さずに見本のフォントを更新する。
 *   改訂 2026-10-04T09:40Z (UTC) / 18:40 JST (kit 1.3.0): handle.update({basePx}) と getBasePx() を追加。
 *   標準の px がフォントで変わるアプリ (dot-soundtest: system 15 / Misaki・DotGothic16 16 / k8x12・PixelMplus12 12)
 *   が、設定画面を作り直さずに 小さめ/標準/大きめ の px と倍率表示を更新できるようにする。根拠は本人の言葉 (2026-10-04):
 *   「文字サイズは滲んでも構わないので数字で細かく設定できるようにしてください。」(全アプリ, px)
 *   「文字サイズスライダーを動かした際にサービスで用いている文字を表示しその場でサイズを確認できるようにしてください」
 *   「例文文字はスライダーの右か左に表示するようにしてください。文字サイズを細かく変えれること、
 *     標準と大小も用意すること、スライダーの横に例を表示することをuiの規定としてください。」
 *   UI rule: STRUCTURE.md C9 / CHECKLIST.md A10・B9.
 *
 * This is the single source. Consumer apps receive a synced copy via
 * bin/sync-web-kit.mjs and must not hand-edit their copy.
 *
 * What it renders (one grid row, two columns, preview BESIDE the slider at
 * every width -- never below it):
 *   [controls: label, range slider, px number input + readout, preset buttons] [live preview]
 * The preview shows the app's own sample strings once per font family the app
 * actually uses (textPreviewFonts()), each labelled with the font name, at the
 * px being chosen. It updates on every `input` event (dragging, typing, arrow
 * keys); by default the setting is applied on release (`change`), or on every
 * input with applyMode: 'live'. Colours/radii/gaps come from existing tokens
 * only (UI theme freeze); no new colour is introduced.
 */

import {
  TEXT_PX_MIN, TEXT_PX_MAX, TEXT_PX_STEP, DEFAULT_BASE_TEXT_PX, DEFAULT_TEXT_PREVIEW_SAMPLES,
  isValidTextPx, setTextPx, setTextSizePreset, textSizeSettingsModel,
} from './theme-kit.js';

/** Data attributes the machine check (checkTextSizeControlLayout) and app
 *  tests look for. Part of the control's versioned interface. */
export const TEXT_SIZE_CONTROL_ATTRS = {
  control: 'data-ui-text-size-control',
  slider: 'data-ui-text-size-slider',
  number: 'data-ui-text-size-number',
  readout: 'data-ui-text-size-readout',
  preview: 'data-ui-text-size-preview',
  status: 'data-ui-text-size-status',
  side: 'data-preview-side',
};

/** Default quick buttons: 小さめ / 標準 / 大きめ (標準 = the app's base px). */
export const DEFAULT_TEXT_SIZE_QUICK_PRESETS = ['small', 'normal', 'large'];

const DEFAULT_PREVIEW_FONTS = [{ name: 'Body / 本文', family: 'inherit' }];

const sameFonts = (a, b) => a.length === b.length && a.every((f, i) => f.name === b[i].name && f.family === b[i].family);
const sameSamples = (a, b) => a.length === b.length && a.every((t, i) => t === b[i]);

const MSG_INVALID = {
  ja: `${TEXT_PX_MIN}〜${TEXT_PX_MAX} の整数で入力してください（前の値のままです）`,
  en: `Enter a whole number from ${TEXT_PX_MIN} to ${TEXT_PX_MAX} (the previous value is kept)`,
};

function css(el, props) {
  for (const [k, v] of Object.entries(props)) el.style.setProperty(k, v);
}

function formatScale(scale) {
  return (Math.round(scale * 100) / 100).toString();
}

/** Text shown next to the slider: "14 px ×1.27". */
export function textSizeReadout(px, basePx = DEFAULT_BASE_TEXT_PX) {
  return `${px} px ×${formatScale(px / basePx)}`;
}

/**
 * Mounts the control into `container` and returns a handle.
 *
 * opts:
 *   settings      current ui-settings document (required)
 *   basePx        this app's normal body px (標準). Default 11 (tokens.css)
 *   onApply(next, info)  called with the new settings when a value is committed
 *                 (release, Enter/blur in the number box, a preset, or every
 *                 input in 'live' mode). info = {px, preset, via}
 *   onPreview(px) optional, called on every previewed value
 *   applyMode     'release' (default) | 'live'
 *   previewSide   'right' (default) | 'left'
 *   fonts         [{name, family}] fonts the app renders with (use
 *                 textPreviewFonts()); default: one row in the inherited font
 *   fontsFor(settings)  optional: derives `fonts` from a settings document
 *                 (e.g. s => textPreviewFonts(catalogue, s.theme, s, extra)).
 *                 Used when `fonts` is not given, and by update({settings})
 *                 so a theme / font change refreshes the preview by itself
 *   samples       sample strings (app UI words). Default DEFAULT_TEXT_PREVIEW_SAMPLES
 *   presets       quick preset ids. Default DEFAULT_TEXT_SIZE_QUICK_PRESETS
 *   idPrefix      id prefix for label/for wiring. Default 'ui-text-size'
 *   announceDelayMs  debounce for the aria-live announcement. Default 500
 *   previewMaxHeight CSS length for the bounded preview box. Default '12rem'
 *   document, setTimeout, clearTimeout  injectable (tests)
 */
export function mountTextSizeControl(container, opts = {}) {
  const doc = opts.document ?? container?.ownerDocument ?? globalThis.document;
  const setT = opts.setTimeout ?? globalThis.setTimeout;
  const clearT = opts.clearTimeout ?? globalThis.clearTimeout;
  const validBase = (v) => typeof v === 'number' && Number.isFinite(v) && v > 0;
  let basePx = validBase(opts.basePx) ? opts.basePx : DEFAULT_BASE_TEXT_PX;
  const applyMode = opts.applyMode === 'live' ? 'live' : 'release';
  const side = opts.previewSide === 'left' ? 'left' : 'right';
  const fontsFor = typeof opts.fontsFor === 'function' ? opts.fontsFor : null;
  const normFonts = (list) => (Array.isArray(list) && list.length > 0 ? list : DEFAULT_PREVIEW_FONTS);
  const normSamples = (list) => (Array.isArray(list) && list.length > 0 ? list : DEFAULT_TEXT_PREVIEW_SAMPLES);
  const fonts = normFonts(opts.fonts ?? (fontsFor ? fontsFor(opts.settings ?? {}) : undefined));
  const samples = normSamples(opts.samples);
  const presetIds = Array.isArray(opts.presets) && opts.presets.length > 0 ? opts.presets : DEFAULT_TEXT_SIZE_QUICK_PRESETS;
  const prefix = opts.idPrefix ?? 'ui-text-size';
  const announceDelay = opts.announceDelayMs ?? 500;

  let settings = opts.settings ?? {};
  let model = textSizeSettingsModel(settings, { basePx });
  let committedPx = model.px;
  let previewPx = model.px;
  let announceTimer = null;

  const el = (tag, attrs = {}, text) => {
    const node = doc.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    if (text !== undefined) node.textContent = text;
    return node;
  };

  // --- structure ---------------------------------------------------------
  const root = el('div', { class: 'ui-text-size', role: 'group', 'aria-labelledby': `${prefix}-label`, [TEXT_SIZE_CONTROL_ATTRS.control]: '', [TEXT_SIZE_CONTROL_ATTRS.side]: side });
  css(root, {
    display: 'grid',
    'grid-template-columns': 'minmax(0, 1fr) minmax(0, 1fr)',
    gap: 'var(--ui-gap, 8px)',
    // stretch: the preview box spans the controls' full height, so it shares
    // the slider's row even when the slider sits low (large page text, 8px samples).
    'align-items': 'stretch',
    'max-width': '100%',
    'min-width': '0',
    'box-sizing': 'border-box',
  });

  const controls = el('div', { class: 'ui-text-size-controls' });
  css(controls, { display: 'flex', 'flex-direction': 'column', gap: 'var(--ui-gap-tight, 4px)', 'min-width': '0' });

  const label = el('span', { id: `${prefix}-label`, class: 'ui-text-size-label' }, `${model.label_ja} / ${model.label_en}`);

  const slider = el('input', {
    type: 'range', id: `${prefix}-slider`, min: String(TEXT_PX_MIN), max: String(TEXT_PX_MAX), step: String(TEXT_PX_STEP),
    'aria-labelledby': `${prefix}-label`, [TEXT_SIZE_CONTROL_ATTRS.slider]: '',
  });
  css(slider, { width: '100%', 'min-width': '0', 'box-sizing': 'border-box', 'accent-color': 'var(--theme-color-accent, var(--ui-accent))' });

  const numberRow = el('div', { class: 'ui-text-size-number-row' });
  css(numberRow, { display: 'flex', 'flex-wrap': 'wrap', 'align-items': 'center', gap: 'var(--ui-gap-tight, 4px)', 'min-width': '0' });
  const numberLabel = el('label', { for: `${prefix}-number` }, 'px');
  const number = el('input', {
    type: 'number', id: `${prefix}-number`, inputmode: 'numeric', min: String(TEXT_PX_MIN), max: String(TEXT_PX_MAX), step: String(TEXT_PX_STEP),
    'aria-label': '文字の大きさ（px） / Text size (px)', 'aria-describedby': `${prefix}-error`, [TEXT_SIZE_CONTROL_ATTRS.number]: '',
  });
  css(number, { width: '5em', 'max-width': '100%', 'box-sizing': 'border-box' });
  const readout = el('output', { for: `${prefix}-slider ${prefix}-number`, [TEXT_SIZE_CONTROL_ATTRS.readout]: '' });
  numberRow.append(numberLabel, number, readout);

  const presetGroup = el('div', { class: 'ui-text-size-presets', role: 'group', 'aria-label': '既定の大きさ / Presets' });
  css(presetGroup, { display: 'flex', 'flex-wrap': 'wrap', gap: 'var(--ui-gap-tight, 4px)', 'min-width': '0' });
  const presetButtons = new Map();
  for (const id of presetIds) {
    const opt = model.options.find((o) => o.id === id);
    if (!opt) continue;
    const b = el('button', { type: 'button', 'data-preset': id, 'aria-pressed': 'false', title: `${opt.px} px` }, `${opt.label_ja} / ${opt.label_en}`);
    presetButtons.set(id, b);
    presetGroup.append(b);
  }

  const error = el('span', { id: `${prefix}-error`, class: 'ui-text-size-error', role: 'alert' });
  error.hidden = true;
  css(error, { color: 'var(--theme-color-danger, var(--ui-danger))' });

  controls.append(label, slider, numberRow, presetGroup, error);

  const preview = el('div', { class: 'ui-text-size-preview', [TEXT_SIZE_CONTROL_ATTRS.preview]: '', 'aria-label': '見本 / Preview' });
  css(preview, {
    position: 'relative',
    'min-width': '0',
    'max-width': '100%',
    'max-height': opts.previewMaxHeight ?? '12rem',
    overflow: 'auto',
    'box-sizing': 'border-box',
    padding: 'var(--ui-gap-tight, 4px)',
    border: '1px solid var(--theme-color-border, var(--ui-border-control))',
    'border-radius': 'var(--ui-r-control, 4px)',
  });
  // `rows` is the same array object for the handle's whole life: update()
  // replaces its contents in place, so callers holding elements.rows see them.
  const rows = [];
  const status = el('span', { 'aria-live': 'polite', [TEXT_SIZE_CONTROL_ATTRS.status]: '' });
  css(status, { position: 'absolute', width: '1px', height: '1px', overflow: 'hidden', clip: 'rect(0 0 0 0)', 'white-space': 'nowrap' });
  let curFonts = fonts;
  let curSamples = samples;
  function renderRows() {
    for (const r of rows) r.row.remove?.();
    rows.length = 0;
    status.remove?.();
    for (const f of curFonts) {
      const row = el('div', { class: 'ui-text-size-preview-row', 'data-font-name': f.name });
      const name = el('span', { class: 'ui-text-size-font-name' }, f.name);
      css(name, { display: 'block', 'font-size': 'var(--ui-fs-caption, 10px)', color: 'var(--theme-color-text, var(--ui-text-label))' });
      const sample = el('div', { class: 'ui-text-size-sample' }, curSamples.join('\n'));
      css(sample, { 'font-family': f.family, 'line-height': '1.3', 'white-space': 'pre-wrap', 'overflow-wrap': 'anywhere', 'word-break': 'break-all' });
      sample.style.setProperty('font-size', `${previewPx}px`);
      row.append(name, sample);
      preview.append(row);
      rows.push({ font: f, row, sample });
    }
    preview.append(status); // stays last
  }
  renderRows();

  if (side === 'left') root.append(preview, controls);
  else root.append(controls, preview);

  // --- behaviour ---------------------------------------------------------
  function announce(px) {
    if (announceTimer !== null) clearT(announceTimer);
    announceTimer = setT(() => {
      announceTimer = null;
      status.textContent = `文字の大きさ ${textSizeReadout(px, basePx)} / Text size ${textSizeReadout(px, basePx)}`;
    }, announceDelay);
  }

  // DOM only: slider/number values, readout, preview rows, preset titles and
  // pressed state. No onPreview, no announcement (update({basePx}) uses it alone).
  function render(px, { fromNumber = false, fromSlider = false } = {}) {
    previewPx = px;
    if (!fromSlider && slider.value !== String(px)) slider.value = String(px);
    if (!fromNumber && number.value !== String(px)) number.value = String(px);
    slider.setAttribute('aria-valuetext', `${px} px`);
    readout.textContent = textSizeReadout(px, basePx);
    for (const r of rows) r.sample.style.setProperty('font-size', `${px}px`);
    for (const [id, b] of presetButtons) {
      const opt = model.options.find((o) => o.id === id);
      if (opt) b.setAttribute('title', `${opt.px} px`);
      b.setAttribute('aria-pressed', String(Boolean(opt && opt.px === px)));
    }
  }

  function showPreview(px, where = {}) {
    render(px, where);
    if (typeof opts.onPreview === 'function') opts.onPreview(px);
    announce(px);
  }

  function setError(on) {
    error.hidden = !on;
    error.textContent = on ? `${MSG_INVALID.ja} / ${MSG_INVALID.en}` : '';
    if (on) number.setAttribute('aria-invalid', 'true');
    else number.removeAttribute('aria-invalid');
  }

  function commit(next, info) {
    settings = next;
    model = textSizeSettingsModel(settings, { basePx });
    committedPx = model.px;
    if (typeof opts.onApply === 'function') opts.onApply(settings, info);
  }

  function commitPx(px, via) {
    if (px === committedPx) return;
    const res = setTextPx(settings, px, { basePx });
    if (res.ok) commit(res.settings, { px, preset: null, via });
  }

  const onSliderInput = () => {
    const px = Number(slider.value);
    setError(false);
    showPreview(px, { fromSlider: true });
    if (applyMode === 'live') commitPx(px, 'slider');
  };
  const onSliderChange = () => commitPx(Number(slider.value), 'slider');
  const onNumberInput = () => {
    const px = Number(number.value);
    if (number.value === '' || !isValidTextPx(px)) {
      number.setAttribute('aria-invalid', 'true');
      return;
    }
    setError(false);
    showPreview(px, { fromNumber: true });
    if (applyMode === 'live') commitPx(px, 'number');
  };
  const onNumberChange = () => {
    const px = Number(number.value);
    if (number.value === '' || !isValidTextPx(px)) {
      // Reject, keep the previous committed value (kit validation style: never clamp).
      setError(true);
      showPreview(committedPx);
      return;
    }
    setError(false);
    commitPx(px, 'number');
  };
  const presetHandlers = new Map();
  for (const [id, b] of presetButtons) {
    const h = () => {
      const res = setTextSizePreset(settings, id, { basePx });
      if (!res.ok) return;
      setError(false);
      showPreview(res.settings.text_px);
      commit(res.settings, { px: res.settings.text_px, preset: id, via: 'preset' });
    };
    presetHandlers.set(id, h);
    b.addEventListener('click', h);
  }
  slider.addEventListener('input', onSliderInput);
  slider.addEventListener('change', onSliderChange);
  number.addEventListener('input', onNumberInput);
  number.addEventListener('change', onNumberChange);

  showPreview(committedPx);
  // The initial render is not an announcement.
  if (announceTimer !== null) { clearT(announceTimer); announceTimer = null; }

  if (container && typeof container.append === 'function') container.append(root);

  /**
   * Live refresh without rebuilding the settings panel (kit 1.2.0). Call it
   * when the theme, the font choice or the app's sample words change.
   *   settings  new ui-settings document: re-syncs slider/number/presets and,
   *             with opts.fontsFor, re-derives the preview fonts
   *   fonts     [{name, family}] replaces the preview font rows (wins over fontsFor)
   *   samples   replaces the sample strings
   *   basePx    (kit 1.3.0) this app's new normal body px (標準), for apps whose
   *             base follows the active font. Preset px values (小さめ/標準/大きめ,
   *             button titles and pressed state) and the ×scale readout are
   *             recomputed. Settings without text_px follow the base (the
   *             slider/number move to the preset's new px; a mid-drag value is
   *             kept). An explicit text_px is absolute and stays; only its
   *             scale changes. A non-positive / non-finite value is ignored.
   * Rows are rebuilt only when fonts or samples actually differ. Without
   * `settings` the preview keeps the px it shows now (also mid-drag). Nothing
   * is applied (onApply / onPreview are not called) and nothing new is
   * announced; a basePx change keeps a pending announcement (it reads the new
   * base when it fires). The root element and focus are left alone.
   * Returns {fontsChanged, samplesChanged, basePxChanged}.
   */
  function update({ settings: nextSettings, fonts: nextFonts, samples: nextSamples, basePx: nextBasePx } = {}) {
    let basePxChanged = false;
    if (nextBasePx !== undefined && validBase(nextBasePx) && nextBasePx !== basePx) {
      basePxChanged = true;
      const wasPreviewingCommitted = previewPx === committedPx;
      basePx = nextBasePx;
      model = textSizeSettingsModel(settings, { basePx });
      committedPx = model.px;
      // text_px is absolute: px stays. Without it the px follows the base,
      // unless the user is mid-drag on an uncommitted value.
      if (wasPreviewingCommitted) previewPx = committedPx;
    }
    if (nextSettings !== undefined) {
      settings = nextSettings ?? {};
      model = textSizeSettingsModel(settings, { basePx });
      committedPx = model.px;
      previewPx = committedPx;
      setError(false);
    }
    let wantFonts = curFonts;
    if (nextFonts !== undefined) wantFonts = normFonts(nextFonts);
    else if (nextSettings !== undefined && fontsFor) wantFonts = normFonts(fontsFor(settings));
    const wantSamples = nextSamples !== undefined ? normSamples(nextSamples) : curSamples;
    const fontsChanged = !sameFonts(wantFonts, curFonts);
    const samplesChanged = !sameSamples(wantSamples, curSamples);
    if (fontsChanged || samplesChanged) {
      curFonts = wantFonts;
      curSamples = wantSamples;
      renderRows();
    }
    if (nextSettings !== undefined) {
      showPreview(previewPx);
      // A re-sync is not an announcement (a pending drag announcement survives a font-only update).
      if (announceTimer !== null) { clearT(announceTimer); announceTimer = null; }
    } else if (basePxChanged) {
      render(previewPx);
    }
    return { fontsChanged, samplesChanged, basePxChanged };
  }

  return {
    element: root,
    elements: { root, controls, label, slider, number, readout, presets: presetButtons, error, preview, rows, status },
    getPreviewPx: () => previewPx,
    getCommittedPx: () => committedPx,
    getSettings: () => settings,
    /** Re-sync after the app changed settings elsewhere (e.g. reset).
     *  Same as update({ settings: next }). */
    setSettings(next) {
      update({ settings: next ?? {} });
    },
    update,
    getBasePx: () => basePx,
    getFonts: () => curFonts.slice(),
    getSamples: () => curSamples.slice(),
    destroy() {
      if (announceTimer !== null) clearT(announceTimer);
      slider.removeEventListener('input', onSliderInput);
      slider.removeEventListener('change', onSliderChange);
      number.removeEventListener('input', onNumberInput);
      number.removeEventListener('change', onNumberChange);
      for (const [id, b] of presetButtons) b.removeEventListener('click', presetHandlers.get(id));
      root.remove?.();
    },
  };
}

/** Pure layout rule (STRUCTURE.md C9-c): the preview must sit BESIDE the
 *  slider -- horizontally adjacent on the configured side and overlapping it
 *  vertically -- and neither box may cross the viewport/container width.
 *  Rects are {left, right, top, bottom}. Returns {ok, reasons[]}. */
export function textSizeLayoutCheck(sliderRect, previewRect, side = 'right', { containerWidth = Infinity, tolerance = 1 } = {}) {
  const reasons = [];
  if (side === 'left') {
    if (previewRect.right > sliderRect.left + tolerance) reasons.push('preview is not to the left of the slider');
  } else if (previewRect.left < sliderRect.right - tolerance) {
    reasons.push('preview is not to the right of the slider');
  }
  if (!(previewRect.top < sliderRect.bottom + tolerance && previewRect.bottom > sliderRect.top - tolerance)) {
    reasons.push('preview does not share the slider row (no vertical overlap)');
  }
  for (const [name, r] of [['slider', sliderRect], ['preview', previewRect]]) {
    if (r.left < -tolerance || r.right > containerWidth + tolerance) reasons.push(`${name} crosses the horizontal edge`);
  }
  return { ok: reasons.length === 0, reasons };
}

/** Browser/Playwright check over every mounted control under `scope`
 *  (default document): runs textSizeLayoutCheck() on real layout boxes and
 *  checks the page itself has no horizontal overflow. Returns
 *  {ok, controls: [{side, ok, reasons}], pageOverflow}. Run it via
 *  page.evaluate at 360/600/1280/1920 widths (CHECKLIST.md B9). */
export function checkTextSizeControlLayout(scope = globalThis.document) {
  const doc = scope.ownerDocument ?? scope;
  const width = doc.documentElement.clientWidth;
  const results = [];
  for (const c of scope.querySelectorAll(`[${TEXT_SIZE_CONTROL_ATTRS.control}]`)) {
    const s = c.querySelector(`[${TEXT_SIZE_CONTROL_ATTRS.slider}]`);
    const p = c.querySelector(`[${TEXT_SIZE_CONTROL_ATTRS.preview}]`);
    const side = c.getAttribute(TEXT_SIZE_CONTROL_ATTRS.side) ?? 'right';
    if (!s || !p) { results.push({ side, ok: false, reasons: ['slider or preview missing'] }); continue; }
    results.push({ side, ...textSizeLayoutCheck(s.getBoundingClientRect(), p.getBoundingClientRect(), side, { containerWidth: width }) });
  }
  const pageOverflow = doc.documentElement.scrollWidth > width + 1;
  return { ok: results.length > 0 && results.every((r) => r.ok) && !pageOverflow, controls: results, pageOverflow };
}
