**Recorded**: 2026-10-19T12:20Z (UTC) / 2026-10-19 21:20 JST — system clock (approximate, from the last `date -u`)

**Provenance**: new folder, 2026-10-19. Owner request of the same day: a Japanese-style pixel picture in the bottom-right of the app background, five proposals in clearly different directions.

# pixel-art

Pixel pictures for the app background.
アプリの背景に置くドット絵です。

## In the app / アプリで使っているもの

`matsuri_bg.png` (480x270) is the owner's final choice of 2026-10-19: D5b with filled heads, the two at the lower left one step darker (#4a4a4a), and no large lantern at the lower right. `BackgroundArt.tsx` fixes it to the lower right of the window behind the whole UI (z-index -1 inside the app root), at 1x, or 2x from 1920x1000; it is hidden below 768 px wide and on light themes (it is drawn in light lines for a dark ground). The panels cover most of it; the owner asked for exactly that: "it is truly a background; it may stay unseen". The night colour is transparent. It is written by `node src/pixel-art/source/make_matsuri_d5.mjs --set d5b --emit-asset src/pixel-art`, from a Recensio board in which the background pixels are never drawn; `matsuri_bg.disclosure.json` is that board's report (all opaque pixels `llm`).
`matsuri_bg.png` は 2026-10-19 に本人が決めた最終形です（D5b、白丸の頭、左下の二人は一段暗い灰、右下の大きな提灯なし）。画面の右下に固定し、UI 全体の後ろに置きます。1 倍、1920×1000 以上で 2 倍、幅 768 px 未満と明るいテーマでは出しません。パネルの下にほとんど隠れますが、本人の指示どおりです（「本当に背景ですので…見えなくて構いません」）。

## matsuri-beat (five proposals) / 花火祭の 5 案

Humans (stick figures) and AI figures (square, screen or diamond heads) at a fireworks festival as equals. A yagura in the centre with three players: taiko, drum kit, and BeatBayashi's Wood Block voice. Lantern strings, stalls from Japan, China, Taiwan, Korea, the US and the UK, bon odori rings, visitors, small jokes, fireworks above.
人（棒人間）と AI（四角・画面・ひし形の頭）が対等に集まる花火祭です。中央のやぐらで太鼓・ドラム・ウッドブロック（BeatBayashi の音色）の三者が打ち、提灯の紐、6 か国の屋台、盆踊りの輪、見物の人、小さな冗談、上に花火があります。

| id | direction / 方針 |
|---|---|
| A_yoru_no_hayashi | night, eye level, warm lanterns on a dark ground / 夜・目の高さ・暗い地面に暖かい提灯 |
| B_ukiyoe | woodblock print: flat colours, star fireworks, a river with boats / 浮世絵: 平らな色・星形の花火・舟の川 |
| C_mioroshi | bird's-eye: the rings read as circles, strings radiate / 見下ろし: 輪が円に見える・紐が放射する |
| D_sumi_to_asagi | ink lines with the app accent and lantern orange only / 墨の線と浅葱・提灯の橙だけ |
| E_8bit | console style, drawn at 200x200 and shown at 2x / ゲーム機風、200x200 を 2 倍 |

## matsuri-beat-d (five variations on D) / D の派生 5 案

Owner, 2026-10-19: D is the favourite (minimal, black and white with an accent, shapes before colour). Five variations, with light sources in the UI palette's yellow and orange (`templates/ui-system/allowed-colors.txt` and the theme's `--app-yellow-*`, `--app-orange-*`, `--app-asagi-*`). No other colours. `source/make_matsuri_d.mjs`, output in `.out/matsuri-beat-d`.
本人（2026-10-19）: D が最も好き。D の派生 5 案です。光源だけ UI パレットの黄・橙を使い、ほかの色は足していません。

| id | direction / 方針 |
|---|---|
| D1_hi_no_wa | D at eye level with warm lantern glow; the upper left left dark for the corner / 目の高さの D に灯りのにじみ |
| D2_mioroshi_no_wa | bird's-eye in ink; the rings read as circles of tiny figures / 墨の見下ろし |
| D3_naname_mioroshi | 3/4 oblique: boxes with top and front faces, 2-head outline figures / 斜め見下ろし、2 頭身の線の人 |
| D4_kawabe | side view on a bank, the river below mirrors only the lights / 川辺、川は灯りだけを映す |
| D5_akari_dake | 16:9 (480x270), only lights and the nearest figures lit / 灯りだけ、16:9 |

## matsuri-beat-d5 (five proposals built on D5) / D5 をもとにした 5 案

Owner, 2026-10-19: D5 chosen, but it has no taiko at the centre. All five keep the two figures slipping off at the left edge, the asagi willow firework, the empty upper left and the dim structures, and put the taiko in the centre of the stage with the wood block on the left and the drum kit on the right. `source/make_matsuri_d5.mjs`, output in `.out/matsuri-beat-d5`.
本人（2026-10-19）: D5 に決めたが、中心に太鼓が無い。5 案とも、左端に抜け出す二人・浅葱の柳の花火・空いた左上・暗い灰の建物を残し、お立ち台の中心に太鼓、左にウッドブロック、右にドラムを置きました。

| id | direction / 方針 |
|---|---|
| D5a_sansha | D5 with the three instruments, taiko under the stage light / D5 に三つの楽器 |
| D5b_yoru_no_yagura | closer, a larger yagura; the ring crops at the bottom / やぐらに寄る |
| D5c_taiko_no_hi | the taiko face is the light; warm glow down to the ground / 太鼓が灯り |
| D5d_obi | 21:9 strip (630x270), more dark room on the left / 21:9 の帯 |
| D5e_hibiki | the beat as asagi arcs spreading from the taiko / 響きの弧 |

## How the pixels are made / ピクセルの作り方

- `source/matsuri_lib.mjs` and `source/make_matsuri.mjs` draw every pixel from code: shapes, ASCII stamps and loops. No image is traced, imported or downsampled.
- コードだけで描いています。画像のなぞり・取り込み・縮小はしていません。
- Reference photos and one public-domain print were looked at for proportions only. They are kept outside the repository (`<refs-dir>/matsuri-beat`, with `SOURCES.md` and `SPATIAL_NOTES.md`) and are not redistributed.
- 参考写真と浮世絵 1 枚は比率を見るためだけに使い、リポジトリの外に置いています。再配布しません。
- With a Recensio checkout (panel limit 7680x4320, Recensio `feat/panel-size-2026`), each picture is also written as a Recensio board through `applyOp(draw_pixels)` with actor `llm`, so its disclosure report says 100% `llm` pixels. Older Recensio (limit 128) fails the board step and the script says so; the PNGs are still written.
- Recensio があれば、各案を `llm` として盤面に描き、開示レポートは全ピクセル `llm` になります。上限 128 の古い Recensio では盤面の段だけ失敗と表示し、PNG は書きます。
- The code was written by Claude in one session (claude-fable-5-1, then claude-opus-5-5 after a model switch). The board records this as a self-reported `model`.

```
node src/pixel-art/source/make_matsuri.mjs [--out <dir>] [--recensio <dir>] [--no-board]
```

Output goes to `.out/matsuri-beat` (git-ignored): `<id>.png`, `<id>_2x.png`, `<id>.palette.json`, `<id>.board.json`, `<id>.disclosure.json`, `contact_sheet.png`, `SUMMARY.txt`.

The scripts are MIT-0 like the rest of the repository (`REUSE.toml`).
