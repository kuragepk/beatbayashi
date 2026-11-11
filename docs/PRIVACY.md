# 何を保存し、何を送信しないか

> 上位文書: [PROJECT-POLICY.md](PROJECT-POLICY.md)（約束2・実装判断の優先順位2）
> このページの記述は、すべてコードを読んで確認できます。確認方法は各項に併記します。

このアプリはアカウントを持ちません。サインアップも、メールアドレスも、
ログインもありません。したがって、あなたが誰であるかを示す情報を本プロジェクトは
一切持っていません。

---

## 1. 保存するもの（すべてあなたの端末の中）

> **要約**: 保存は全部あなたの端末の中です。何をどこに保存するか、コードの場所つきで書いています。

Web版は、以下をブラウザのlocalStorageに保存します。これはあなたのブラウザの中に
だけ存在し、どこにも送信されません。

| キー | 内容 | 書くとき | 消し方 | コード |
|---|---|---|---|---|
| `BeatBayashi.sequencer` | BPM・小節数・分解能・レーン・グリッド（サブ音の段を含む）・アクセント・スウィング・音量の写し・選択中のドラム | 編集の 0.5 秒後（自動保存）と、ページを離れるとき | 開発者ツールで削除 | `src/store/sequencerStore.ts` |
| `BeatBayashi.drumSettings` | 各ドラム・各音色ごとのスライダーの値 | 設定パネルで保存したとき、レイヤーをリセットしたとき | 開発者ツールで削除 | `src/components/SettingsPanel.tsx` |
| `BeatBayashi.drumSettings.v2` | レーンごとの音の構成（レイヤー・プリセット・レーン FX の設定） | レーンの音色・レイヤー・スライダー・レーン FX を変えたとき（500 ms 後に自動保存）と、ページを離れるとき。版つき文書（`version: 1`）で、個人情報は含まない（プリセット ID・数値・レーン ID だけ）。2026-10-07 に配線 | 開発者ツールで削除 | キー `src/audio/soundStorageKey.ts`、読み書き `src/audio/soundPersistence.ts`、中身 `src/audio/AudioEngine.ts`（`getSoundDocument`／`loadSoundDocument`） |
| `BeatBayashi.soundBasis` | 音の基礎設定（基礎とジャンル） | 基礎かジャンルを切り替えたとき | 開発者ツールで削除 | `src/audio/soundBasis.ts`・`src/App.tsx` |
| `BeatBayashi.volumeScale` | 音量の目盛りをパーセント表示へ移し終えた印（文字 `1`） | 起動時に一度だけ | 開発者ツールで削除（消すと次の起動でもう一度移す） | `src/store/masterVolume.ts` |
| `grammarouban.masterDb` | マスター音量（dB。家族の音のサービスで共通のキー。共通部品 `@otoinki/loudness` が決める） | 音量を変えたとき、起動時の移行のとき | 開発者ツールで削除 | `src/store/masterVolume.ts`（キー名は `@otoinki/loudness`） |
| `grammateion.masterDb` | 同じマスター音量の、共通キーの一つ前の名前。`grammarouban.masterDb` が空のときだけ、共通部品が起動時に値をそこへ写し、旧キーを消す。新しく書くことはない | 書かない（移して消すだけ） | 自動で消える | `@otoinki/loudness` |
| `bb-layout-v1` | パネルの並び・サイズ・自動フィットの設定 | ツールバーの「保存」を押したとき | ツールバーの「リセット」 | `src/layout/layoutStore.ts` |
| `bb-rights-language` | 権利表記の表示言語 | 表示言語を選んだとき | 開発者ツールで削除 | `src/i18n/i18n.ts` |
| `bb-user-presets-v1` | あなたが付けた音色名と保存時刻 | 音色を保存・削除・読み込んだとき | 設定パネルで 1 件ずつ削除 | `src/audio/userPresets.ts` |
| `bb-ui-settings-v1` | 表示設定（テーマ・色・フォント・動き・文字サイズ） | 外観の設定を変えたとき | 外観の「リセット」 | `src/theme/themeStore.ts`（書き込みは `src/theme/kit/theme-kit.js`） |
| `bb-ui-settings-v1.control-order` | 外観パネル内のボタンの並び | 並びを入れ替えたとき | 外観の「リセット」 | `src/theme/themeStore.ts` |
| `bb-ui-settings-v1.on-style` | ON のステップの見せ方（1 段・明るさ・印） | 外観で見せ方を選んだとき | 外観の「リセット」 | `src/theme/themeStore.ts` |
| `bb-ui-settings-v1.ux` | レトロゲーム風の操作感（枠・カーソル。色は変えない）を入れたかどうか。無ければ切 | 外観で入り切りしたとき | 外観の「リセット」 | `src/theme/themeStore.ts` |
| `bb-ui-settings-v1.text-base` | 文字サイズの基準を 11px に移し終えた印 | 起動時に一度だけ | 開発者ツールで削除（外観のリセットでは消えません） | `src/theme/themeStore.ts` |

「開発者ツールで削除」は、ブラウザの開発者ツール → Application → Local Storageで、そのキーを選んで消すことです。
ブラウザのサイトデータを消せば、上の全部が消えます。

以前の名前（`orb-*`・`beatBayashi.*`・`BeatBayashi-KoinonBayashi.*`）のキーは、起動時に一度だけ新しいキーへ写して消します（`src/storage/legacyKeys.ts`）。

この表は `src/storage/privacyTable.test.ts` が検査します。コードにあるキーが表に無いと、そのテストが落ちます。

再生状態（`isPlaying`）は意図的に保存しません。

**確認方法**: ブラウザの開発者ツール → Application → Local Storage。
あるいは `grep -rn "localStorage\.\(setItem\|getItem\|removeItem\)" src --include=*.ts --include=*.tsx | grep -v test`。

## 2. 送信するもの

> **要約**: 既定では何も送りません。パターン API を自分で動かしたときだけ、そこへ送ります。

既定では、何も送信しません。アプリはネットワークに出ずに完結します。パターン保存APIへの
到達確認も、フッターの「Use backend」トグルであなたがONにしたときだけ行われます。トグルは
既定でOFFです。

例外は、あなたが自分で立ち上げ、トグルをONにしたときだけ動く、あなた自身のパソコンの中の
サーバーです。

| 宛先 | いつ | 何が送られるか |
|---|---|---|
| `http://localhost:8080/api`（パターン保存 API） | あなたが `node mock-backend.js` か Spring バックエンドを起動しているときだけ | パターン（名前・BPM・小節数・グリッド） |

このサーバーは既定で127.0.0.1（自分のパソコンの中）にのみ待ち受けます。
LAN上の端末から届かせるには明示的な指定（`ORB_HOST=0.0.0.0` / `server.address=0.0.0.0`）が
必要で、その場合、認証が無いため同じネットワークの誰でも読み書きできます。
信頼できるネットワークでのみ行ってください。

**確認方法**: `grep -rn "fetch(\|axios" src beatbayashi-mobile/*.js`
で、外部に出る通信がこれだけであることを確かめられます。
通信そのものは、開発者ツールのNetworkタブでも観測できます。

## 2.5 コンソールログ（Spring バックエンドを自分で起動したとき）

> **要約**: Spring バックエンドはコンソールへログを出します。既定の設定では、シーケンサーを
> 再生するたびにグリッドの中身（あなたが組んだリズムパターン）が DEBUG レベルで出力されます。
> INFO レベルにはグリッドの長さだけが出て、中身は出ません。

`beatbayashi-backend/src/main/resources/application.properties` の既定は
`logging.level.app.beatbayashi=DEBUG` です。このため、`/api/sequencer/play` を叩くたびに
`SequencerService` は次の2行をコンソールに出します。

| レベル | 内容 |
|---|---|
| INFO | BPM と、グリッド文字列の長さ（文字数）のみ |
| DEBUG | 上記に加えてグリッドの中身そのもの |

コンソール出力はあなたのターミナル（または `logging.file.name` で指定した場所）に残るだけで、
どこにも送信されません。ログレベルを下げてグリッドの中身を出したくない場合は
`logging.level.app.beatbayashi=INFO` に変更してください。

**確認方法**: `grep -n "log\.\(info\|debug\)" beatbayashi-backend/src/main/java/app/beatbayashi/service/SequencerService.java`。

## 3. やらないこと

> **要約**: 解析（アナリティクス）、アカウント、勝手な外部送信はしません。

- テレメトリ・アクセス解析・利用状況の収集（コードに存在しません）
- 第三者へのデータ提供（そもそもデータを受け取っていません）
- 広告目的のプロファイリング
- Cookieによる追跡

**確認方法**: `grep -rniE "analytics|telemetry|gtag|mixpanel|sentry|amplitude" src`
が何も返さないこと。依存ライブラリの一覧は
[dependency-licenses.csv](dependency-licenses.csv) にあります。

## 4. 書き出したファイル

> **要約**: 書き出したファイルはあなたの端末に保存されるだけで、私はその中身を知りません。

MIDI・WAV・JSON・音色レシピは、あなたの端末のダウンロード先に保存されるだけです。
本プロジェクトはその内容を知りません。

## 5. 未確認・限界

> **要約**: 確かめていないことの一覧です。

- デスクトップ版（Electron）はLinux向けのビルドのみ確認しています。
  macOS・Windows向けのビルドと署名は未検証です。
- モバイル版（Expo）は実機で動かしたことがありません。コードを読む限り、
  送信先は上記のパターン保存APIのみです。
- 本ページはこのリポジトリのコードについての説明です。あなたが導入した
  ブラウザ拡張機能や、改変したフォークの挙動までは保証できません。

## 改定

> **要約**: 改定の記録です。

内容が変わったときは、このページと DECISIONS.md の両方に理由を残します。

- 2026-09-11制定: ポリシー §5が義務付けていたが未作成だったため。
  記述はすべて当日のコードを読んで確認。
- 2026-09-18追記: レイヤー対応の音作りパラメータ（`beatBayashi.drumSettings.v2`）と
  ユーザープリセット（`orb-user-presets-v1`）が表になかったため追加。パターン保存APIへの
  到達確認をopt-in（既定OFFのトグル）にしたため §2を修正。
- 2026-09-29追記: Springバックエンドの `SequencerService` がグリッドの中身をINFO
  レベルでログ出力していた（監査指摘4、`docs/audits/AUDIT_20260918_backend_privacy.md`）ため
  §2.5を追加。修正: INFOはグリッドの長さのみ、中身はDEBUGに移動（ISSUE-BEATBOX-032）。
- 2026-10-01改名: 製品名の変更（BeatBayashi）に合わせ、保存キーの接頭辞を `orb-` から `kb-` に変更。
  旧キーの値は起動時に一度だけ新キーへ写し、旧キーは消す（`src/storage/legacyKeys.ts`）。保存する中身は変わらない。
- 2026-10-01改名（2回目）: パターンと音作りの設定のキーを `beatBayashi.*` から `BeatBayashi-KoinonBayashi.*` に変更（作者決定）。
  移し方は上と同じ（起動時に一度だけ写して確かめてから旧キーを消す）。保存する中身は変わらない。
  表に `BeatBayashi-KoinonBayashi.soundBasis` とマスター音量のキーが抜けていたので足した。マスター音量のキーは共通部品が決めるので、この製品では名前を変えていない。
- 2026-10-07表の作り直し: 製品名の変更（BeatBayashi、2026-10-06）で保存キーの接頭辞が `BeatBayashi-KoinonBayashi.*` から
  `BeatBayashi.*` に変わっていたのに、表が旧名のままでした。コードの `localStorage` 呼び出しから表を作り直し、
  抜けていた `bb-ui-settings-v1` とその付属3キー、`BeatBayashi.volumeScale` を足しました。
  `bb-rights-language` の書き込み元は `src/i18n/i18n.ts` でした。列に「書くとき」と「消し方」を足し、
  表のずれを検出するテスト `src/storage/privacyTable.test.ts` を加えました。
