# BeatBayashi

A drum sequencer for people who want to publish what they make.
作ったものを公開したい人のためのドラムシーケンサーです。

Every sound is synthesised in your browser as it plays. すべての音は再生時にブラウザ内で合成されます。
Nothing is sampled from a record, so there is no third-party recording in anything you export: nothing to clear, credit, or pay for.
レコードから録音を取り込むことはないため、書き出したものに第三者の録音は含まれません。許諾も、クレジット表記も、支払いも不要です。

Anything you make with BeatBayashi can be used freely. BeatBayashiで作成したものは自由に利用可能です。
Sell it, publish it anywhere, modify it, redistribute it, and you never have to name this app.
販売しても、どこで公開しても、改変しても、再配布してもかまいません。このアプリの名前を出す必要もありません。

各節の冒頭にある「要約」は、作者が自分の言葉に書き直すための下書きです（2026-09-13）。本文は要約の根拠です。

---

## Why this exists / この項目がある理由

> **要約**: 初心者は、作った曲を公開してよいか分からないことが多い。その答えをアプリの中で出すために作りました。

Beginners often cannot tell whether the music they make with a tool is safe to release.
初心者は、ツールで作った曲を公開してよいか分からないことがよくあります。
"Free" and "royalty-free" do not answer the question that actually matters: *am I allowed to publish this?*
「フリー」や「ロイヤリティフリー」という言葉は、実際に大事な問い、つまり「これを公開してよいのか」には答えません。

This project answers that question inside the app, so you never have to read a GitHub page to find out what you are allowed to do.
このプロジェクトはその問いにアプリの中で答えるので、何をしてよいか知るためにGitHubのページを読む必要はありません。

## What it does / できること

> **要約**: 12 ジャンル × 6 のリズム性格で 72 パターン、4 声部、ステップシーケンサ、MIDI / WAV / SFZ の書き出し、音色の保存、10 言語の権利表示。

- 12 genres × 6 rhythmic characters = 72 built-in patterns (House, Techno, Dubstep, Drum & Bass, Gabber, Breakcore, …)
  12ジャンル × 6のリズム性格で、72のプリセットパターンがあります（House、Techno、Dubstep、Drum & Bass、Gabber、Breakcoreなど）。
- 4 voices (Kick, Tom, Cymbal, Clap), each with selectable synth presets, and each can have extra lanes added (up to 8 total) to layer more than one preset per voice
  4つの声部（Kick、Tom、Cymbal、Clap）はそれぞれシンセのプリセットを選べ、レーンを追加して（最大8レーンまで）声部ごとに複数のプリセットを重ねられます。
- Step sequencer at 1/2 – 1/32 resolution, 1 or 2 bars, with per-step swing and a 3-level accent (weak/mid/strong) on every step
  ステップシーケンサは1/2から1/32の解像度、1小節または2小節、ステップごとのスウィングと3段階のアクセント（弱・中・強）に対応します。
- Mute / solo per lane (the M and S buttons) to hear one part on its own. WAV export follows the same muting, so the file matches what you heard; MIDI export always writes every lane regardless of mute/solo. Export volume is fixed rather than following the master volume slider, so the same pattern renders at the same level every time
  レーンごとのミュート／ソロ（MボタンとSボタン）で、ひとつのパートだけを聴けます。WAVの書き出しは同じミュート状態を反映するため、聴いた通りのファイルになります。MIDIの書き出しはミュート／ソロにかかわらずすべてのレーンを書き込みます。書き出しの音量はマスターボリュームのスライダーに従わず固定されているため、同じパターンは毎回同じ音量で書き出されます。
- Customisable panel layout: move, resize, auto-fit, save, and reset
  パネルレイアウトを調整でき、移動・リサイズ・自動フィット・保存・リセットができます。
- Export your pattern as MIDI (for your DAW), WAV, or an SFZ sampler instrument
  パターンをMIDI（DAW用）、WAV、またはSFZサンプラー音源として書き出しできます。
- Keep the sounds you tune under a name, and export them to another machine
  調整した音色を名前を付けて保存し、別のマシンへ書き出せます。
- Ten interface languages, one at a time, picked at the top right: English, 日本語, 简体中文, 繁體中文（台灣）, 繁體中文（香港）, हिन्दी, 한국어, Español, العربية and Français. Everything except English is machine-written
  画面の言語は10種類で、右上で選んだ1つだけを表示します（英語・日本語・简体中文・繁體中文（台灣）・繁體中文（香港）・हिन्दी・한국어・Español・العربية・Français）。英語以外はすべてデバイスで書いた文です。
- Sub sounds with their own steps. Under each row of square pads, a thin row per sub sound turns that sub on or off for each step
  サブの音は自分のステップを持ちます。 四角いパッドの行の下に、サブの音ごとに細い行があり、ステップごとにそのサブの音を入れたり切ったりできます。
- Usable without a mouse. Step grid: arrow keys move, Space or Enter switches the main step, Shift+Space the first sub step. Sliders: arrow keys, Page Up/Page Down (ten steps), Home/End; each slider also has ◀ ▶ buttons that repeat while held (Shift+click = ten steps) and a box to type the value (Enter to set, Escape to cancel)
  マウスなしで使えます。 ステップ: 矢印キーで移動し、SpaceかEnterでメインのステップ、Shift+Spaceで1つ目のサブのステップを切り替えます。スライダー: 矢印キー、Page Up/Page Down（10目盛り）、Home/Endで動かせます。各スライダーには押し続けると繰り返す ◀ ▶ ボタン（Shift+クリックで10目盛り）と、値を入力する欄（Enterで決定、Escapeで取り消し）があります。

## Requirements / 動作要件

> **要約**: Node.js 22 以上だけです。データベースもアカウントも要りません。

- Node.js 22+ and pnpm 11 (the version is pinned in `packageManager`; `corepack enable` picks it up) (the test suites need 22: jsdom's undici throws on import under Node 20. The app itself builds and runs on older versions, but you cannot check it on them.)
  Node.js 22以上とpnpm 11が必要です（版は `packageManager` に固定。`corepack enable` で同じ版が入ります）（22が必要な理由: Node 20ではjsdomのundiciがimport時に例外を投げるからです。アプリ自体は古いバージョンでもビルド・動作しますが、それらでの検証はできません）。

That is all for the app itself: no database server and no account.
アプリ本体に必要なのはこれだけです。データベースサーバーもアカウントも不要です。

The phone app, the optional pattern API servers and the internal documents are developed in a separate private repository.
スマホアプリ、任意のパターンAPIのサーバー、内部の文書は、別の非公開のリポジトリで開発しています。

## Quick start / クイックスタート

> **要約**: `pnpm install` と `pnpm run dev`。

```bash
# Web app
pnpm install
pnpm run dev          # http://localhost:5173
```

### Building for production / 本番ビルド

```bash
pnpm run build        # outputs to dist/
pnpm run preview
```

### Running the checks / 検査の実行

```bash
pnpm test             # preset data, re-timing rules, layout persistence, exports, sequencer
pnpm exec tsc --noEmit
pnpm run lint
```

The same checks run in CI on every push and pull request, along with a check that the rights notice shown in the apps still matches `docs/rights-notice.json`.
同じ検査はpushとpull requestのたびにCIでも実行され、アプリ内に表示される権利表示が `docs/rights-notice.json` と一致しているかの確認も含まれます。

## How it is put together / 構成

> **要約**: React + Vite + Tone.js の Web アプリ。音は Tone.js のクラスをドラムごとに選んで合成しています。

```
src/                   React 18 + TypeScript + Vite + Zustand + Tone.js
  audio/               Synth voice definitions (Tone.js), audio engine
  components/          Sequencer grid, controls, presets, rights banner, panels
  export/              MIDI, WAV, and SFZ file writers (rendering itself is in src/audio/)
  layout/              Panel layout store (persisted to localStorage)
electron-main.js       Optional desktop shell (Electron)
```

Sound design note: each drum voice uses the Tone.js class that actually models it: `MembraneSynth` for Kick/Tom, `NoiseSynth` for Clap, `MetalSynth` for Cymbal. Choosing the right class matters more than tuning parameters: a clap built from a cymbal generator cannot be fixed by adjusting its envelope.
音作りについて: 各ドラム声部は、実際にその音をモデル化するTone.jsのクラスを使っています。KickとTomには `MembraneSynth`、Clapには `NoiseSynth`、Cymbalには `MetalSynth` です。パラメータの調整よりも、正しいクラスを選ぶことのほうが重要です。シンバル用のジェネレータから作ったClapは、エンベロープをいくら調整しても直りません。

## Licence and what you can do / ライセンスとできること

> **要約**: コードは MIT-0、内蔵のプリセットとパターンは CC0 1.0 と MIT-0 の選択制、音は実行時に合成（リポジトリに音声ファイルは無い）、作ったものはあなたのもの。表示義務もありません。

- Code: MIT No Attribution, MIT-0 (see [LICENSE](LICENSE)). It replaced MIT on 2026-10-06.
  コード: MIT-0（MIT No Attribution、[LICENSE](LICENSE) を参照）。2026-10-06にMITから変えました。
- Built-in sound presets and the 72 rhythm patterns: CC0 1.0 or MIT-0, whichever you choose. Neither asks for credit.
  内蔵の音色プリセットと72のリズムパターン: CC0 1.0とMIT-0のどちらか好きな方の条件で使えます。どちらもクレジット表記は要りません。
- Sounds: generated at runtime by Tone.js; the repository contains no audio files
  音: 実行時にTone.jsが生成します。リポジトリに音声ファイルは含まれていません。
- What you make: entirely yours. Commercial use, redistribution, and modification are all permitted, and attribution is not required.
  作ったもの: すべてあなたのものです。商用利用、再配布、改変はすべて許可されており、表示義務はありません。

Runtime dependencies are MIT-licensed, plus 0BSD for `tslib`. MIT asks you to keep their notices when you redistribute the app; they are in `THIRD-PARTY-NOTICES.txt`.
実行時の依存パッケージはMITライセンスで、`tslib` のみ0BSDです。アプリを再配布するときは、MITの条件として依存パッケージの表示（`THIRD-PARTY-NOTICES.txt`）を残してください。

In more detail, and in plain language:
より詳しく、平易な言葉で説明した文書は以下の通りです。

| Document / 文書 | What it answers / 何を答えるか |
|---|---|
| [docs/TERMS.md](docs/TERMS.md) | 作ったものをどう扱ってよいか（日本語） |
| [docs/RIGHTS-FAQ.en.md](docs/RIGHTS-FAQ.en.md) | The same, in English |
| [docs/PRIVACY.md](docs/PRIVACY.md) | 何が保存され、何が送信されないか, with the file and line to check |
| [docs/PROVENANCE.md](docs/PROVENANCE.md) | Where every sound and dependency came from |
| [docs/PROJECT-POLICY.md](docs/PROJECT-POLICY.md) | プロジェクトの上位文書（迷ったらここに戻る） |
| docs/DECISIONS.md (kept in the private repository) | Why it is built this way, and what has gone wrong |

## Checking any of this yourself / 自分で確かめる

> **要約**: ここに書いた主張は信じなくてよい。`docs/HOW_TO_VERIFY.md` に自分で確かめる手順があります。

Each claim above can be checked.
上に書いた主張は、どれも自分で確かめられます。
[docs/HOW_TO_VERIFY.md](docs/HOW_TO_VERIFY.md) lists every way to inspect the project right now: in a browser, in the app, on the desktop, from a phone, and from a terminal. It includes the exact commands that prove no recordings are bundled and that the rights notice shown in the app matches its source.
[docs/HOW_TO_VERIFY.md](docs/HOW_TO_VERIFY.md) には、ブラウザ・アプリ内・デスクトップ・スマートフォン・ターミナルから今すぐ確認できるすべての方法が書かれています。録音が同梱されていないことと、アプリ内の権利表示がソースと一致していることを証明する具体的なコマンドも含まれます。

## Honest status / 正直な現状

> **要約**: 確かめていないことの一覧です。スマホ実機、macOS/Windows のパッケージ、サンプラーでの SFZ 読込は未検証。音は作者が耳で確認しています。

This is a personal project, and these parts are not verified:
これは個人プロジェクトであり、以下の部分は未検証です。

The sounds have been checked by ear by the owner (the owner's report, 2026-10-22). Whether they sound like their genres has not been tested with musicians.
音は作者が耳で確認しています（作者の報告、2026-10-22）。ジャンルらしく聞こえるかは、音楽家によるテストをしていません。

| Area / 領域 | Status / 状態 |
|---|---|
| Whether the built-in patterns genuinely sound like their genre | Not verified: subjective, untested with musicians |
| Voices | Four voice categories (kick, tom, cymbal, clap), each extendable with up to 4 extra lanes (8 total); for example, closed and open hats can now coexist as two cymbal-family lanes. The category set itself is still fixed. |
| Electron packaging | The Linux AppImage is built and started by `scripts/verify-electron-package.sh`, which checks that the packaged binary renders the UI. macOS and Windows builds, code signing and installation on a real desktop are not verified |
| SFZ export | Verified by performing it in a browser (`scripts/verify-exports.mjs`): a standard unzip accepts the archive and all four samples are WAVs with audio in them. Never loaded into an actual sampler |
| Automated tests | Cover the re-timing rules, the layout, saved-sound and voice-layer stores, the preset wording, MIDI note mapping, swing/accent, lane add-remove, and the WAV/ZIP/SFZ writers; `scripts/verify-exports.mjs` drives the real browser for the exports. What the drums sound like is still judged by ear only |

## Security / セキュリティ

> **要約**: 脆弱性の報告先は `SECURITY.md`。

See [SECURITY.md](SECURITY.md) for how to report a vulnerability.
脆弱性の報告方法は [SECURITY.md](SECURITY.md) を参照してください。
