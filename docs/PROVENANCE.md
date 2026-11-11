# この音はどこから来たのか — 出どころと、公開してよい根拠

> 最終検証: 2026-09-29
> ライセンス表記の更新: 2026-10-06（コードを MIT から MIT-0 へ。内蔵プリセットとパターンは CC0 1.0 と MIT-0 の選択制。本人決定 2026-09-30・2026-10-02）
> このファイルは「作ったものを公開してよいか分からない」という不安に、
> 事実で答えるための文書です。すべての記述に検証方法を併記しています。

---

## 結論を先に

**このアプリで作ったリズムと音は、公開・改変・再配布・商業利用のすべてができます。**

理由は一つです。**このアプリは録音物を一切持っていない**から。

---

## 1. なぜ録音物を持たないことが決定的なのか

音楽で権利が問題になるとき、危ないのはたいてい **録音物（サンプル）** です。
誰かが叩いたドラムの録音には、その演奏者・録音者・レーベルの権利が付いてきます。
「無料でダウンロードできた」ことと「自分の作品に入れて配ってよい」ことは別問題です。

このアプリは、その問題そのものを回避しています。

**音は鳴らす瞬間に計算で作られています。** キックの「ボン」も、ハイハットの「チッ」も、
どこかの誰かが録音した音ではなく、`Tone.js` が波形を数式で組み立てたものです。
元になった録音が存在しないので、誰かの権利を踏む余地がありません。

### 検証方法

リポジトリ内に音声ファイルが 1 件も無いことを確認できます。

```powershell
# 音声ファイルを全検索（node_modules を除く）
Get-ChildItem -Recurse -File -Include *.wav,*.mp3,*.ogg,*.flac,*.aiff,*.m4a |
  Where-Object { $_.FullName -notmatch 'node_modules' }
# → 何も出力されなければ、録音物は一つも同梱されていません
```

2026-08-20 の実行結果: **0 件**。

---

## 1-2. `beatbayashi-mobile/`（スマホアプリ）の生成物

同ディレクトリには二種類のファイルがあり、どちらも録音物ではありません。

**アイコン画像**（`assets/android-icon-background.png` 等 6 ファイル、追跡済み）は、
このプロジェクトのために描いた BeatBayashi のアイコン U2（本人決定 2026-10-02）です。
ドット絵で描き、整数倍の最近傍拡大だけで大きくしています。外部の素材は使っていません。
以前ここにあった Expo のテンプレート画像（650 Industries, Inc.、MIT）は置き換え済みです。
ライセンスは MIT-0 です（[REUSE.toml](../REUSE.toml) の App icons の項）。

**ドラム音の WAV**（`assets/sounds/*.wav`。アプリが鳴らすのは kick・snare・hat・clap の 4 つ）は `npm install` の
`postinstall` フックで `scripts/generate-drum-samples.js` が実行時に生成し、
**リポジトリには含まれません**（追跡対象外・`.gitignore` 済み）。生成方法は web 版と同じ
「録音でなく計算」で、外部の音源やサンプルパックを一切参照していません。

| 音 | 合成方法 |
|---|---|
| kick | 正弦波を下向きにピッチスイープさせ、指数関数的に減衰させる |
| snare | ホワイトノイズを高速な指数減衰で短く切る |
| hat | 板の非整数比の正弦波 9 本（胴）と、高域通過・低域通過をかけたホワイトノイズ（余韻）と、ごく短い高域ノイズ（打撃）を、それぞれの減衰で重ねる（Web 版の `CymbalSynth` と同じ作り）。同じ作りで `hat_open`・`ride`・`crash` も生成するが、アプリはまだ使っていない |
| clap | 短いノイズバーストを複数個、タイミングをずらして重ねる |

乱数は `Math.random()` ではなく固定シード（`mulberry32`）の決定論的 PRNG を使っており、
同じスクリプトを何度実行しても同一のバイト列が生成されます（再現性のためで、暗号学的な
強度は求めていません）。スクリプト本体は SPDX ヘッダで MIT-0 と明記されています
<!-- REUSE-IgnoreStart -->（`SPDX-FileCopyrightText: 2026 BeatBayashi contributors` /
`SPDX-License-Identifier: MIT-0`）。<!-- REUSE-IgnoreEnd -->

### 検証方法

```bash
cat beatbayashi-mobile/scripts/generate-drum-samples.js | head -20   # SPDX ヘッダと合成方法の説明
grep postinstall beatbayashi-mobile/package.json                    # 生成が install 時に走ることの確認
git ls-files beatbayashi-mobile/assets/sounds/                      # 何も出力されなければ WAV は未追跡
```

このため、リポジトリに音声ファイルが 0 件だという結論（本文書冒頭）は mobile を含めても
変わりません。

---

## 2. 使っているソフトウェアのライセンス

音を作っている `Tone.js` を含め、**Web ランタイム**で読み込まれる依存パッケージを全部調べました。

> **スコープの明記（2026-09-22 追記）**: `dependency-licenses.csv` は `web` / `mobile` / `backend` の
> 3 スコープに分かれています。以下の表と件数は **web スコープのみ**の集計です。
> mobile（`expo`・`react-native`・`axios`、いずれも MIT）と backend
> （`spring-boot`・`sqlite-jdbc`・`hibernate-community-dialects`、いずれも Apache-2.0）は別途
> CSV に掲載していますが、集計・検証はこのページでは行っていません。
> **未検証**: 各 Apache-2.0 成果物（backend スコープ）が上流に `NOTICE` ファイルを持つかどうかは
> 確認していません。Apache-2.0 は `NOTICE` の転記を要求する場合がありますが、Web を禁止された
> 環境では各リポジトリの現物を確認できないため、断定を避けています。

| ライセンス | 件数 | 意味 |
|---|---|---|
| MIT | 14（web スコープ） | 著作権表示を残せば、商用含め自由 |
| 0BSD | 1（tslib、web スコープ） | MIT よりさらに緩い。表示義務すらない |
| 未設定 | 1 | **本プロジェクト自身**。→ ライセンスを設定して解消済み（現在は MIT-0） |

上記は web スコープのみの件数です。mobile（MIT 3 件）・backend（Apache-2.0 4 件）は
含みません。全スコープの内訳は `dependency-licenses.csv` の `scope` 列を参照してください。

**公開・改変・再配布・商用利用を妨げるライセンスは一つもありません。**

主要なもの:

| パッケージ | ライセンス | 役割 |
|---|---|---|
| tone 14.9.17 | MIT | 音の合成 |
| react 18.3.1 / react-dom | MIT | 画面 |
| zustand 4.5.7 | MIT | 状態管理 |
| tslib 2.8.1 | 0BSD | TypeScript 補助 |

### 検証方法

```bash
cd beatbayashi
pnpm licenses list --prod
```

（2026-10-07 に npm から pnpm へ移行。それまでは `npx license-checker --production --summary` でした。license-checker は npm の入れ子の node_modules を前提にしていて、pnpm の木では依存を見落とします。）

全件の一覧は [dependency-licenses.csv](dependency-licenses.csv) に保存してあります。

### 配布するときに守ること

本プロジェクトのコードは MIT-0（MIT No Attribution）です。MIT-0 は著作権表示もライセンス文も求めません。
ただし、アプリに組み込まれている依存パッケージ（上の表）の多くは MIT です。MIT は「著作権表示とライセンス文を残す」ことを条件にしています。
このアプリを**改造して配布する**場合は、依存パッケージの表示をまとめた [THIRD-PARTY-NOTICES.txt](../THIRD-PARTY-NOTICES.txt) を一緒に配ってください。

**あなたが作った曲を発表する場合は、この義務はありません。**
ソフトウェアの配布と、そのソフトで作った作品の発表は別のことです。

---

## 3. リズムパターンについて

同梱している 72 種のリズムパターンは、**ジャンルの定型を打ち込み直したもの**で、
どの録音からも取り込んでいません。

一般に、単純なリズムそのものは著作物として保護されにくいとされています
（「4つ打ち」や「2拍4拍にスネア」を誰かが独占することはできません）。
ただし本プロジェクトでは、より安全側に倒すため次の方針を採ります。

- パターン名に**特定の楽曲名・アーティスト名を使わない**
- 名前は**リズムの性質そのもの**を表す（例:「Two-Step」「Boom Bap」）

理由は、権利の問題というより**誤解を避けるため**です。
特定の曲名がついていると、利用者が「あの曲の音源が入っているのか」
「あの曲に関係があるのか」と誤認しかねません。約束4（分からないことを分からないと書く）に反します。

> **経緯の記録**: 2026-08-20 の初期実装では、実在の楽曲名を冠したパターン名を
> 使っていました。本ポリシー制定にあたり、上記の理由で全面的に改名しています。
> 詳細は DECISIONS.md。

---

## 4. あなたが作ったものの権利

**あなたのものです。** 本プロジェクトは何も主張しません。

書き出したもの（音声・MIDI・パターン・音色設定）に、本プロジェクトは権利を主張しません。
アプリ由来の部分（内蔵の音色プリセットとその数値、内蔵の 72 リズムパターン）は、[CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) と [MIT-0](https://opensource.org/license/mit-0) のどちらか好きな方の条件で使えます。
どちらもクレジット表記は要りません。あなたが足した部分は、あなたのものです。

The project claims no rights in anything you export: audio, MIDI, pattern files or sound settings.
Whatever part of it came from the app (the built-in sound presets and their parameter values, and the 72 built-in rhythm patterns) is offered under [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) or [MIT-0](https://opensource.org/license/mit-0), whichever you choose.
Neither asks for credit. What you added yourself stays yours.

| 対象 | 権利者 |
|---|---|
| あなたが打ち込んだリズムパターン | あなた |
| あなたが調整した音色パラメータ | あなた |
| 書き出した音声ファイル | あなた |
| 書き出した MIDI | あなた |
| 内蔵の音色プリセット（数値データ） / Built-in sound presets (parameter data) | CC0 1.0 または MIT-0（選択制） / CC0 1.0 or MIT-0, your choice |
| 内蔵の 72 リズムパターン / The 72 built-in rhythm patterns | CC0 1.0 または MIT-0（選択制） / CC0 1.0 or MIT-0, your choice |
| それを使って作った楽曲 | あなた |

商用利用も、二次配布も、改変も自由です。クレジット表記も不要です
（していただけたら嬉しいですが、義務ではありません）。

---

## 5. 音声素材を追加するとき（開発者向け）

将来サンプル音源を追加する場合、本プロジェクトの基準は **CC0 / パブリックドメイン相当のみ**です。

### なぜ「無料」では足りないのか

2026-08-20 に主要な無料サンプル配布サイトの規約を実際に読んで検証しました。
**多くのサイトが再配布を明示的に禁止しています。**

| サイト | 規約の原文 | 判定 |
|---|---|---|
| MusicRadar (SampleRadar) | "all we ask is that you **don't re-distribute** them" | ✗ 同梱不可 |
| Sample Focus | "You may not: Sell, share, sublicense, or **redistribute** the sound" | ✗ 同梱不可 |
| 99Sounds | "You do not have the right to sell or **redistribute (even for free)**" | ✗ 同梱不可 |

「無料でダウンロードできる」＝「アプリに入れて配ってよい」ではありません。
アプリへの同梱は再配布にあたるため、上記はいずれも使えません。

### 使えることを確認した提供元

| 提供元 | ライセンス | 規約の原文 |
|---|---|---|
| **VCSL** (Versilian Studios) | CC0 | "Essentially it's Public Domain- you can do whatever you want with these sounds (even make commercial software), no royalties, no credit, no special terms." |
| **Freesound** の CC0 絞り込み | CC0（音ごとに要確認） | "CCO sounds have no restrictions." |
| **OpenGameArt** の CC0 絞り込み | CC0 | CC0 フィルタの提供を確認 |

Freesound は**音ごとにライセンスが異なる**ため、CC0 でのフィルタが必須です。

### CC-BY を採用しない理由

CC-BY（表示ライセンス）は、**帰属表示の義務が最終利用者に転嫁されます**。
「この音を使った曲を出すたびにクレジットを書かねばならない」状態は、
本プロジェクトの「安心して創作を始められる」という目的と両立しません。

---

## 6. この文書の限界

- 本プロジェクトは**法律助言を提供しません**。事実と根拠を示すだけです
- ライセンスは**変更されることがあります**。上記は 2026-08-20 時点の確認結果です
- 商業的に重要な判断をする場合は、ご自身で最新の規約を確認してください
- 検証方法をすべて併記しているのは、**私の言葉を信じる必要がないようにする**ためです

---

---

## 6-2. 同梱フォント（テーマ用・18 ファイル）

> **来歴**: 2026-10-02 追記（リリース表 R7）。机上の `templates/ui-system/fonts/manifest.json`
> と各 `LICENCE.txt`、`<font>.provenance.json` から転記。フォント自体の権利情報は
> `THIRD-PARTY-NOTICES.txt` の「Bundled fonts」にも載せています。

**要約**: ビルド（`dist/assets/`）には、画面テーマ用のフォント 18 ファイルが入ります。
いずれも録音物ではなく、ライセンスは OFL-1.1 または「自由に使える」旨の許諾で、機械的に確認できました（UNKNOWN はありません）。

- 12 家族・18 ファイル（リリース表の初版は「19」と書きましたが、実測は 18 です）。`dist/assets/` の 18 個のファイル名に含まれる 8 桁の sha256 接頭辞は、すべて机上の `manifest.json` の値と一致しました（2026-10-02、スクリプトで照合）。
- 18 ファイルすべてについて、机上の実ファイル（5 個は `templates/ui-system/fonts/`、13 個は `<local-dev-dir>\fonts\`）の sha256 を全桁で再計算し、`manifest.json` と一致を確認しました（2026-10-02、`node templates/ui-system/bin/sync-web-kit.mjs <kit> --check` と別の Python 照合）。
- ライセンス欄 `LicenseRef-littlelimit-free`: Num Kadoma（littlelimit.net）氏の「自由に使え、改変・再配布・商用可、無保証」の文面（`misaki/LICENCE.txt`、`k8x12/LICENCE.txt`）。SPDX 識別子ではなく、`manifest.json` が付けた独自の印です。
- `mplus`: M+ FONTS PROJECT の同趣旨の文面（`PixelMplus12/LICENCE.txt`）。

| 家族 | ファイル | sha256（先頭 12 桁） | ライセンス | 著作権表示（フォントまたはライセンスファイルの記載どおり） | 入手元 |
|---|---|---|---|---|---|
| Misaki | misaki_gothic.ttf | `0963e11e89d5` | LicenseRef-littlelimit-free | Num Kadoma | https://littlelimit.net/misaki.htm |
| k8x12 | k8x12.ttf | `f810d41373e7` | LicenseRef-littlelimit-free | Num Kadoma | https://littlelimit.net/k8x12.htm |
| PixelMplus12 | PixelMplus12-Regular.ttf | `02f19467ea7c` | mplus | M+ FONTS PROJECT; Itou Hiroki | https://github.com/itouhiro/PixelMplus/releases/download/v1.0.0/PixelMplus-20130602.zip |
| PixelMplus12 | PixelMplus12-Bold.ttf | `7276753dc808` | mplus | M+ FONTS PROJECT; Itou Hiroki | https://github.com/itouhiro/PixelMplus/releases/download/v1.0.0/PixelMplus-20130602.zip |
| DotGothic16 | DotGothic16-Regular.ttf | `155da8f31855` | OFL-1.1 | The DotGothic16 Project Authors (Fontworks) | https://github.com/fontworks-fonts/DotGothic16/archive/14517183ab2f75e8bccafc5a0bff6685d268c687.zip |
| BIZ UDPGothic | BIZUDPGothic-Regular.ttf | `258d7156c165` | OFL-1.1 | Copyright 2022 The BIZ UDGothic Project Authors (https://github.com/googlefonts/morisawa-biz-ud-gothic) | https://github.com/google/fonts/tree/23e54b51ddffbc7713c583748e3bd86f62b1fa4a/ofl/bizudpgothic |
| BIZ UDPGothic | BIZUDPGothic-Bold.ttf | `30eba52fc837` | OFL-1.1 | Copyright 2022 The BIZ UDGothic Project Authors (https://github.com/googlefonts/morisawa-biz-ud-gothic) | https://github.com/google/fonts/tree/23e54b51ddffbc7713c583748e3bd86f62b1fa4a/ofl/bizudpgothic |
| BIZ UDGothic | BIZUDGothic-Regular.ttf | `709fcd41e320` | OFL-1.1 | Copyright 2022 The BIZ UDGothic Project Authors (https://github.com/googlefonts/morisawa-biz-ud-gothic) | https://github.com/google/fonts/tree/23e54b51ddffbc7713c583748e3bd86f62b1fa4a/ofl/bizudgothic |
| BIZ UDGothic | BIZUDGothic-Bold.ttf | `98a528b6b638` | OFL-1.1 | Copyright 2022 The BIZ UDGothic Project Authors (https://github.com/googlefonts/morisawa-biz-ud-gothic) | https://github.com/google/fonts/tree/23e54b51ddffbc7713c583748e3bd86f62b1fa4a/ofl/bizudgothic |
| Noto Sans JP | NotoSansJP\[wght\].ttf | `c2f3b4d46350` | OFL-1.1 | (c) 2014-2021 Adobe (http://www.adobe.com/), with Reserved Font Name 'Source'. | https://github.com/google/fonts/tree/23e54b51ddffbc7713c583748e3bd86f62b1fa4a/ofl/notosansjp |
| M PLUS 1 | MPLUS1\[wght\].ttf | `32dab296a06c` | OFL-1.1 | Copyright 2021 The M+ FONTS Project Authors (https://github.com/coz-m/MPLUS_FONTS) | https://github.com/google/fonts/tree/23e54b51ddffbc7713c583748e3bd86f62b1fa4a/ofl/mplus1 |
| M PLUS 2 | MPLUS2\[wght\].ttf | `2e4f45c23913` | OFL-1.1 | Copyright 2021 The M+ FONTS Project Authors (https://github.com/coz-m/MPLUS_FONTS) | https://github.com/google/fonts/tree/23e54b51ddffbc7713c583748e3bd86f62b1fa4a/ofl/mplus2 |
| IBM Plex Sans JP | IBMPlexSansJP-Regular.ttf | `372f8bba95f3` | OFL-1.1 | Copyright 2018 IBM Corp. All rights reserved. | https://github.com/google/fonts/tree/23e54b51ddffbc7713c583748e3bd86f62b1fa4a/ofl/ibmplexsansjp |
| IBM Plex Sans JP | IBMPlexSansJP-Bold.ttf | `bd8a98b9b55c` | OFL-1.1 | Copyright 2018 IBM Corp. All rights reserved. | https://github.com/google/fonts/tree/23e54b51ddffbc7713c583748e3bd86f62b1fa4a/ofl/ibmplexsansjp |
| LINE Seed JP | LINESeedJP-Regular.ttf | `04a6c0077ddb` | OFL-1.1 | (c) LY Corporation | https://github.com/google/fonts/tree/23e54b51ddffbc7713c583748e3bd86f62b1fa4a/ofl/lineseedjp |
| LINE Seed JP | LINESeedJP-Bold.ttf | `67aec2dc10b3` | OFL-1.1 | (c) LY Corporation | https://github.com/google/fonts/tree/23e54b51ddffbc7713c583748e3bd86f62b1fa4a/ofl/lineseedjp |
| Zen Kaku Gothic New | ZenKakuGothicNew-Regular.ttf | `b840cd07a67d` | OFL-1.1 | Copyright 2022 The Zen Project Authors (https://github.com/googlefonts/zen-kakugothic) | https://github.com/google/fonts/tree/23e54b51ddffbc7713c583748e3bd86f62b1fa4a/ofl/zenkakugothicnew |
| Zen Kaku Gothic New | ZenKakuGothicNew-Bold.ttf | `0081cedabc49` | OFL-1.1 | Copyright 2022 The Zen Project Authors (https://github.com/googlefonts/zen-kakugothic) | https://github.com/google/fonts/tree/23e54b51ddffbc7713c583748e3bd86f62b1fa4a/ofl/zenkakugothicnew |

### きれいな checkout からのビルド（フォントの入れ方）

フォントの実体は git に入りません（`.gitignore` が `src/theme/kit/fonts/` を除外）。出どころは机上の `templates/ui-system/fonts/`（小さな 5 ファイル）と `<local-dev-dir>\fonts\`（残り 13 ファイル）です。机上の取り込みは次の順です。

```bash
# 机上（デスク）のルートで。ネットワーク不要（<local-dev-dir>\fonts に既にある場合）。--check を付けると書かずに差分だけ見る
node templates/ui-system/bin/sync-web-kit.mjs loop/worktrees/BEATBOX-SOUND/beatbayashi/src/theme/kit
# <local-dev-dir>\fonts に足りないとき（ネットワークが要る。取得後は intake-desk check を通す）
node templates/ui-system/bin/fetch-fonts.mjs
```

**実測（2026-10-02）**: `src/theme/kit/fonts/` を一時的に退避して `npx vite build --outDir <scratch>` を実行すると、エラーなく終了（exit 0）しますが、出力に `.ttf` は 0 個でした（フォントなしで静かに成功し、ピクセル風テーマの見え方は確認していません＝未検証）。つまり「ビルドが通る」ことと「フォントが入っている」ことは別で、後者は上のスクリプトで入れた場合だけ成り立ちます。（退避したフォルダは元に戻し、通常のビルドは 18 個を出力することを確認済み。）

**きれいな checkout の経路（本人決定 2026-10-02、実装済み）**: ビルド前にピン留めした URL から取得し、sha256 が一致したフォントだけ使います。`npm run build` の `prebuild` が `scripts/fetch-kit-fonts.mjs` を走らせ、`scripts/kit-fonts.pinned.json`（ファイル・出どころ URL・sha256、18 件。机上の `manifest.json` から `scripts/gen-kit-fonts-pins.mjs` で生成）の足りない分だけを https で取得します。一致しない・既存ファイルが違う・取得失敗はビルドを止めます（exit 1）。18 件とも揃って一致していればネットワークは使いません（机上のビルドはオフラインのまま）。出どころ: 13 件は google/fonts の固定コミット `23e54b5…` の raw URL、DotGothic16 は fontworks-fonts の固定コミットの zip、PixelMplus12 は GitHub のリリース資産 v1.0.0 の zip、Misaki と k8x12 は littlelimit.net の版付き zip（2021-05-05）です。最後の 2 件だけは個人サイトの URL で、GitHub のような固定コミットではありません（sha256 が一致しなければ使わないので中身は保証されますが、サイトが落ちていればビルドは止まります）。zip は取得後に同名のメンバーを取り出して sha256 を確認します。テストは `src/theme/fetchKitFonts.test.ts`（ネットワークなし）。実ネットワークでの取得は未検証です。

**注意**: 2026-10-02 の `sync-web-kit.mjs --check` で、コミット済みのテーマキット 4 ファイル（`theme-check.js`・`season.js`・`theme-kit.js`・`themes.css`）が机上の最新と違っていました（フォントは全部一致）。ここでは同期していません（キットの中身が変わるため）。


---

## English summary

**Every sound in this app is synthesised at runtime by Tone.js. No audio recordings
are bundled — verified: zero audio files in the repository.** There is therefore no
third-party recording right to infringe.

The web app's runtime dependencies are MIT (14) or 0BSD (1); see `dependency-licenses.csv`.
The project's code is MIT-0. The built-in sound presets (parameter data), the 72 built-in
rhythm patterns and any future samples are offered under CC0 1.0 or MIT-0, whichever you choose.

**Anything you create with this app — patterns, parameters, exported audio, exported
MIDI, and the music you make from them — belongs to you.** No attribution required. The project claims no rights in exported
files; the app's own contribution to them is offered under CC0 1.0 or MIT-0, whichever you choose.

The project's own code (MIT-0) needs no notice. If you redistribute a modified copy of
*the software*, include THIRD-PARTY-NOTICES.txt, because the bundled MIT dependencies ask for it.
Publishing *music made with* the software carries no such obligation.

Sample packs may only be added under CC0 / public-domain terms. "Free" and even
"royalty-free" are insufficient: MusicRadar, Sample Focus and 99Sounds were each
verified on 2026-08-20 to forbid redistribution outright.
