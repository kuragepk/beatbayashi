// Ramp preview colours (2026-10-06, new). The app computes each shade from theme tokens (../pixelIconPalette.ts);
// these hexes are only the board palette and PNG previews.
// Asagi (owner 2026-10-06: a wider light-dark range of the current asagi): mixes of the default asagi #0f8a80.
// Warm hues (owner 2026-10-06, later: asagi plus yellow-orange-red as in the app icon, so instrument and section
// icons read by colour): orange and red are the theme's --app-orange-* / --app-red-* (src/theme/theme-bridge.css,
// matched to the asagi lightness); yellow has no theme token yet, so these are new, at about the same lightness.
// Shades 1-2: interior shading only. Shades 3-5: may be a silhouette (>= 3:1 vs #0a0a0a).
export const RAMP = [
  { token: '--pixel-icon-asagi-1', hex: '#073e3a' }, // 45% asagi + black
  { token: '--pixel-icon-asagi-2', hex: '#0b6860' }, // 75% asagi + black
  { token: '--pixel-icon-asagi-3', hex: '#0f8a80' }, // asagi
  { token: '--pixel-icon-asagi-4', hex: '#63b3ac' }, // 65% asagi + white
  { token: '--pixel-icon-asagi-5', hex: '#b7dcd9' }, // 30% asagi + white
];
export const WARM = {
  yellow: ['#4a3a10', '#7d6418', '#a8861f', '#c9b06a', '#e6dbb4'],
  orange: ['#4a3216', '#7d5424', '#a66f30', '#c59f72', '#e4d2bd'],
  red: ['#5d261b', '#9b3f2d', '#c85943', '#d0988d', '#e9cfca'],
};
// Grid codes: '1'..'5' asagi, 'A'..'E' yellow, 'F'..'J' orange, 'K'..'O' red (1 = darkest .. 5 = lightest).
export const HUES = ['asagi', 'yellow', 'orange', 'red'];
export const SHADES = [RAMP.map((r) => r.hex), WARM.yellow, WARM.orange, WARM.red];
export const CODES = { asagi: '12345', yellow: 'ABCDE', orange: 'FGHIJ', red: 'KLMNO' };
