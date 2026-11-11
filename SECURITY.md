# Security Policy

各節の冒頭にある「要約」は、作者が自分の言葉に書き直すための下書きです（2026-09-13）。本文は要約の根拠です。

## Reporting a vulnerability

> **要約**: GitHub の非公開報告（Security → Report a vulnerability）で送ってください。個人の余暇の開発なので、返事はしますが期日は約束できません。

Please report security issues through
[GitHub's private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability)
on this repository (Security → Report a vulnerability), rather than opening a public issue.

This is a personal project maintained in spare time. I will do my best to acknowledge a
report within about a week, but I cannot promise a fixed response or patch timeline.

## Scope

> **要約**: アプリはブラウザの中だけで動きます。アカウントも送信もありません。XSS、`mock-backend.js` の穴、データが勝手に外へ出る経路は報告してほしいものです。

The application runs entirely in your browser. It has no accounts, no telemetry, and
sends nothing to a server unless you run the optional pattern storage API yourself.

Things worth reporting:

- Cross-site scripting or code execution reachable through the web app
- Vulnerabilities in `mock-backend.js` (path traversal, request handling)
- Anything that causes data to leave the user's machine unexpectedly

## Known limitations (not vulnerabilities; these are documented design decisions)

> **要約**: `mock-backend.js` に認証は無く、だから 127.0.0.1 にしか bind しません。パターンは平文保存。Electron とスマホ版は未検証。

- `mock-backend.js` has no authentication. It binds to `127.0.0.1` by default for
  that reason. Setting `ORB_HOST=0.0.0.0` exposes it to your local network; do that
  only on a network you trust.
- Patterns are stored unencrypted in `patterns.json`.
- The Electron shell and the mobile app are unfinished and unverified; see the
  "Honest status" section of the README.

## Supported versions

> **要約**: 対応するのは `master` の最新 commit だけです。リリースブランチはありません。

Only the latest commit on `master` is supported. There are no maintained release
branches.

<!-- standard-stamp: src=bin/gen-repo-standard.py src-sha256=b5d5e6d366ac self-sha256=3bb1b3eb29a9 stamped=2026-09-15T21:41:15Z -->

## Supported versions (by release line)

An earlier "Supported versions" section above already says only the latest `master` commit is supported. This table states the same thing by version number.
上の「Supported versions」節のとおり、対応するのは `master` の最新 commit だけです。この表は同じことを版番号で示します。

| Version | Supported |
|---|---|
| 0.1.x (latest `master`) | Yes |
| Anything older | No |

## Local backend: no login, never on the internet

The local backends (`mock-backend.js` and `beatbayashi-backend/`) have no login and no access control, and must never be exposed to the internet.
ローカルのバックエンド（`mock-backend.js` と `beatbayashi-backend/`）にはログインもアクセス制御も無いので、インターネットには絶対に公開しないでください。
