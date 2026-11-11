**Recorded**: 2026-10-02T15:57:36Z (UTC) / 2026-10-03 00:57:36 JST — system clock

**Provenance**: new folder, 2026-10-03. Owner request of the same day: pixel icons in place of the emoji in the BeatBayashi UI, and a play/stop and control icon set. Owner decision of the same day: the part lives here for now and moves to Portus after the 2026-10-16 release.

# pixel-icons

A 16 x 16 pixel icon set (ui16, 55 icons: 29 from 2026-10-03 and 26 label icons from 2026-10-06) and the React component that draws it.
16 x 16 のピクセルアイコン集（ui16、55 個。2026-10-03 の 29 個と 2026-10-06 の見出し用 26 個）と、それを描く React 部品です。

## This is a temporary home / ここは仮の置き場です

The folder stays inside BeatBayashi until the 2026-10-16 release. After that it moves to Portus as its own shared package, and other services depend on it instead of copying it.
2026-10-16 のリリースまでは BeatBayashi の中に置きます。その後 Portus の独立した共有パッケージへ移し、ほかのサービスは写さずに依存として使います。

To keep the move a plain folder copy, three rules hold here:
移すときにフォルダを写すだけで済むよう、ここでは三つを守ります。

- Nothing in this folder imports from the rest of the app. The app imports from `index.ts` only. `isolation.test.ts` fails otherwise.
- このフォルダからアプリのほかの部分を import しません。アプリは `index.ts` からだけ import します。破ると `isolation.test.ts` が落ちます。
- No colour is set here. Main pixels use `currentColor`; accent pixels use a CSS colour the caller passes (a theme token), or `currentColor`.
- 色はここで決めません。主なピクセルは `currentColor`、差し色のピクセルは呼び出し側が渡す CSS の色（テーマのトークン）か `currentColor` です。
- The only runtime dependency is React.
- 実行時の依存は React だけです。

## Use / 使い方

```tsx
import { PixelIcon, IconLabel } from '../pixel-icons';

<button type="button"><IconLabel icon="play">PLAY</IconLabel></button>
<button type="button" aria-label="Sound settings"><PixelIcon name="gear" /></button>
```

`PixelIcon` draws an inline SVG of 1-pixel-high `<rect>` runs with `shape-rendering="crispEdges"`, at 16, 32 or 48 CSS px only, so pixels stay square. It is `aria-hidden` unless you pass `label`; the button keeps its name from its visible text or its own `aria-label`.
`PixelIcon` は高さ 1 ピクセルの `<rect>` を並べたインライン SVG を `shape-rendering="crispEdges"` で描きます。大きさは 16・32・48 CSS px だけなので、ピクセルは正方形のままです。`label` を渡さない限り `aria-hidden` で、ボタンの名前は見えている文字かボタン自身の `aria-label` から付きます。

## Size follows the text size / 大きさは文字の大きさに合わせます

Added 2026-10-04. An icon without a `scale` prop takes its size from the text scale the app passes through `PixelIconTextScale.Provider` (1 = normal). The size is the whole multiple of 16 px nearest to the text scale; a tie goes to the smaller one, and the cap is 48 px. Pass `scale` to keep a fixed size (for a mark that must not change).
2026-10-04 追加。`scale` を渡さないアイコンは、アプリが `PixelIconTextScale.Provider` で渡す文字の倍率（1 が標準）から大きさを決めます。大きさは文字の倍率にいちばん近い 16 px の整数倍で、ちょうど中間のときは小さい方、上限は 48 px です。大きさを固定したいもの（変えてはいけない印など）は `scale` を渡します。

| text size / 文字の大きさ | small | normal | large | x-large | xx-large |
|---|---|---|---|---|---|
| text scale / 倍率 | 0.875 | 1 | 1.25 | 1.5 | 2 |
| icon / アイコン | 16 px | 16 px | 16 px | 16 px | 32 px |

x-large stays at 16 px: a 32 px icon next to text that grew only by half looks heavier than its label, and the small toolbar buttons are sized for 16 px. The folder still reads nothing from the app; the app passes the number.
x-large は 16 px のままです。文字が 1.5 倍のときに 32 px にすると、ラベルより重く見え、小さいツールバーのボタンも 16 px を前提にしているためです。このフォルダは今もアプリから何も読まず、数値はアプリが渡します。

## Label icons and the asagi ramp / 見出しのアイコンと浅葱の階調

Added 2026-10-06. `labelIcons.ts` maps a UI label key (the i18n key where one exists) to an icon, for a mark in front of each label: `<IconLabel icon={LABEL_ICONS.tempo}>Tempo</IconLabel>`. New grids are in `source/icons16-labels.mjs`; labels that already had a fitting icon reuse it.
2026-10-06 追加。`labelIcons.ts` は UI の見出しのキー（あれば i18n のキー）からアイコンへの対応表で、見出しの頭に印を付けるのに使います。新しい格子は `source/icons16-labels.mjs` にあり、合うアイコンがすでにある見出しはそれを使います。

Owner, same day: the asagi may use a wider light-dark range. Grids may use `1`..`5`, five shades of one hue (`pixelIconPalette.ts`). Each shade is `color-mix` of a base (the `accent` prop, else `--pixel-icon-asagi`, else `currentColor`) with black or white, and `--pixel-icon-asagi-<n>` overrides it, so the folder still sets no colour. Shades 1-2 are interior shading only; outlines are `#` or shades 3-5, which keep at least 3:1 on the dark background with the default asagi (`labelIcons.test.ts`).
同日の本人の指示で、浅葱の明暗の幅を広げました。格子では `1`〜`5` の 5 段階（同じ色相）を使えます。各段は基準の色（`accent`、なければ `--pixel-icon-asagi`、なければ `currentColor`）と黒か白の `color-mix` で、`--pixel-icon-asagi-<n>` で個別に上書きできます。1・2 は内側の陰だけに使い、輪郭は `#` か 3〜5 にします（既定の浅葱で暗い背景に 3:1 以上、テストで確認）。

Later the same day the owner allowed yellow, orange and red as in the app icon, so instrument and section icons read by colour. Grids may also use `A`..`E` (yellow), `F`..`J` (orange) and `K`..`O` (red). Those shades read the theme's `--app-<hue>-<n>` tokens (orange and red are in `theme-bridge.css`; yellow has none yet), else mix `--pixel-icon-<hue>`. Kick, tom, cymbal, clap, drum, note and the section icons use them, lit from the top; functional icons (speaker, play, save, ...) keep `currentColor`.
同日、本人の指示でアプリのアイコンと同じ黄・橙・赤も使えるようにしました。楽器と見出しのアイコンだけに使い、上から光が当たる陰影にしています。スピーカーや再生などの機能アイコンは `currentColor` のままです。黄色はテーマにトークンがまだ無いため、`--app-yellow-<n>` をテーマ側で定義すると効きます。

`source/render_label_sheet.mjs` draws the label icons at 1x and 4x with the ramp to `.out/shots/label_icons_sheet.png`.

## Where the pixels come from / ピクセルの出どころ

- `source/icons16.mjs`: the authored grids (claude-code, claude-opus-5-5, 2026-10-03).
- `source/make_ui16.mjs`: draws each grid into Recensio boards through `applyOp(draw_pixels)`, so every pixel has provenance `llm`, then writes `pixelIconData.ts` from the boards (not from the grids).
- `source/ui16-*.board.json`, `source/ui16-*.disclosure.json`: the boards and Recensio's disclosure reports (100% `llm` pixels).
- `source/render_sheet.mjs`: the contact sheet (1x, 2x, 4x on dark and light themes).
- `source/icons16.mjs` は描いた格子、`source/make_ui16.mjs` はそれを Recensio に描き込み（全ピクセルの来歴が `llm`）、ボードから `pixelIconData.ts` を書き出します。ボードと開示レポートも `source/` にあります。

The scripts import Recensio read-only from `--recensio <dir>` (or `RECENSIO_DIR`; by default the first `projects/recensio` found above this folder) and write previews to `--out <dir>` (or `UI16_OUT`; by default `.out/beatbayashi-icons/ui16`, which git ignores). The options are in `source/paths.mjs`. They are kept as the record of how the data was made; the app does not run them.
スクリプトは Recensio を `--recensio <dir>`（または `RECENSIO_DIR`。既定は、この場所から上にたどって最初に見つかる `projects/recensio`）から読み取り専用で import し、プレビューを `--out <dir>`（または `UI16_OUT`。既定は git の対象外の `.out/beatbayashi-icons/ui16`）に書きます。指定のしかたは `source/paths.mjs` にあります。データの作り方の記録として置いており、アプリは実行しません。

To regenerate the app data: `node source/make_ui16.mjs --recensio <dir> --out <dir> --emit-ts pixelIconData.ts`, run in this folder. The pixels and their provenance come out the same; board ids and timestamps in the board and disclosure JSON are new on every run.
アプリのデータを作り直すときは、このフォルダで `node source/make_ui16.mjs --recensio <dir> --out <dir> --emit-ts pixelIconData.ts` を実行します。ピクセルと来歴は同じになります。ボードと開示レポートの JSON にある ID と時刻は、実行のたびに新しくなります。

The icons are our own work under the repository's MIT-0 licence (see `REUSE.toml`).
アイコンは自作で、リポジトリの MIT-0 ライセンスに従います（`REUSE.toml` 参照）。
