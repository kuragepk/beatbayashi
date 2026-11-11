/* Shiroko UI System web kit — season.js: date -> season sub-palette rule.
 * 依存: なし (素の ES モジュール)。
 * 来歴: 新規作成 (2026-09-27, シロコ委任エージェント)。移植元:
 *   projects/grammarouban-tools/packages/palette-check/src/grammarouban_palette_check/season.py
 * 試験ベクトルは同ファイルの docstring と一致することを test/theme-kit.test.mjs で確認する。
 *
 * Rule (documented, deterministic): meteorological seasons by calendar month.
 *   northern hemisphere (default): Mar-May spring, Jun-Aug summer, Sep-Nov autumn, Dec-Feb winter
 *   southern hemisphere: the same months shifted by six (Sep-Nov spring, Dec-Feb summer, ...)
 * The user can always override: an explicit sub-palette name wins over the date rule.
 * 規則: 気象学上の季節（月で決める）。北半球が既定。南半球は 6 か月ずらす。
 * 利用者の明示指定が常に優先。
 */

export const SEASONS = Object.freeze(['spring', 'summer', 'autumn', 'winter']);
export const HEMISPHERES = Object.freeze(['north', 'south']);

const NORTH_BY_MONTH = {
  3: 'spring', 4: 'spring', 5: 'spring',
  6: 'summer', 7: 'summer', 8: 'summer',
  9: 'autumn', 10: 'autumn', 11: 'autumn',
  12: 'winter', 1: 'winter', 2: 'winter',
};
const SWAP = { spring: 'autumn', autumn: 'spring', summer: 'winter', winter: 'summer' };

/** @param {Date} date a JS Date (local calendar month is used, 1-12 via getMonth()+1) */
export function seasonForDate(date, hemisphere = 'north') {
  if (!HEMISPHERES.includes(hemisphere)) {
    throw new Error(`hemisphere must be one of ${HEMISPHERES.join(', ')}, got ${JSON.stringify(hemisphere)}`);
  }
  const month = date.getMonth() + 1;
  const s = NORTH_BY_MONTH[month];
  return hemisphere === 'north' ? s : SWAP[s];
}

/** User override (if a known season) wins; otherwise the date rule. */
export function chooseSubPalette(date, hemisphere = 'north', override = null) {
  if (override && SEASONS.includes(override)) return override;
  return seasonForDate(date, hemisphere);
}
