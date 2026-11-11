# How to check this project yourself

Every claim in this repository should be checkable by the person reading it. This page
lists every way the project can be inspected right now — in a browser, on the desktop,
from a phone, and from a terminal — so no statement here has to be taken on trust.

This repository is the public copy of the web app. The phone app, the optional pattern
API servers and the internal documents are developed in a separate private repository,
so the checks for them are not on this page. Every script named below is in this
repository.

---

## 1. In a browser — GitHub

The default pull request filter is `is:pr is:open`. Draft pull requests appear, but
**closed ones are hidden**, so a branch that was reopened under a new pull request can go
unnoticed. When verifying that something really was closed, drop the filter to `is:pr`.

| What you want to see | Where |
|---|---|
| **All pull requests, including closed and draft** | https://github.com/kuragepk/beatbayashi/pulls?q=is%3Apr |
| Open pull requests only | https://github.com/kuragepk/beatbayashi/pulls |
| Every branch, by last commit | https://github.com/kuragepk/beatbayashi/branches |
| Commit history on the default branch | https://github.com/kuragepk/beatbayashi/commits/main |
| A single commit's full diff | `https://github.com/kuragepk/beatbayashi/commit/<sha>` |
| Compare any two points | `https://github.com/kuragepk/beatbayashi/compare/<a>...<b>` |
| Search the code | https://github.com/search?q=repo%3Akuragepk%2Fbeatbayashi&type=code |
| **Prove no audio files are committed** | https://github.com/search?q=repo%3Akuragepk%2Fbeatbayashi+extension%3Awav+OR+extension%3Amp3+OR+extension%3Aogg+OR+extension%3Aflac&type=code |
| Licence as GitHub detects it | https://github.com/kuragepk/beatbayashi/blob/main/LICENSE |
| Dependency graph and known advisories | https://github.com/kuragepk/beatbayashi/network/dependencies |
| Security overview (alerts, advisories) | https://github.com/kuragepk/beatbayashi/security |
| Repository settings and visibility | https://github.com/kuragepk/beatbayashi/settings |
| Everything you own, across repositories | https://github.com/pulls · https://github.com/issues |
| Your recent activity anywhere | https://github.com/kuragepk?tab=overview |

**Browse the code without cloning**: press `.` on any GitHub page of this repository to
open it in a web editor, or change `github.com` to `github.dev` in the URL.

## 2. In a browser — the app itself

```bash
pnpm install
pnpm run dev            # http://localhost:5173
```

| What you want to check | How |
|---|---|
| What you are allowed to do with your music | The banner at the top of the page; pick your language with the flag dropdown |
| The evidence behind that claim | "Project philosophy and policy" opens the detail panel |
| That no recording is involved | Export a WAV, then check the sound recipe export: every layer of every voice lists a synthesis technique, not a sample |
| What your pattern actually contains | Export as MIDI and open it in any DAW |
| How the sound was built | "Export sound recipe" writes the synthesis parameters as JSON |

Build the production bundle and serve it exactly as it would ship:

```bash
pnpm run build && pnpm run preview   # http://localhost:4173
```

## 3. On the desktop — Electron shell

```bash
pnpm run electron-dev
```

The Help/About dialog restates the licence and the "no bundled audio" claim, so the
desktop build can be checked without a browser.

Packaging is checked by a script rather than by hand:

```bash
scripts/verify-electron-package.sh
```

It runs `electron-builder`, starts the packaged binary under a virtual display and
reads the rendered DOM back over the DevTools protocol, so a window that opens on a
blank page fails. Linux only, and it downloads about 200 MB the first time, which is
why CI does not run it.

**Still unverified:** the macOS and Windows targets, code signing, and installing the
AppImage on a desktop that is not this container.

## 4. On a phone

Run the dev server with `pnpm run dev --host`, then open the printed
`http://192.168.x.x:5173` address from a phone on the same Wi-Fi. This is the real app,
in the phone's browser.

## 5. From a terminal — the checks anyone can re-run

```bash
# Type safety and lint
pnpm exec tsc --noEmit && pnpm run lint

# Production build
pnpm run build

# No audio files anywhere in the working tree
find . -path ./node_modules -prune -o \
  \( -name '*.wav' -o -name '*.mp3' -o -name '*.ogg' -o -name '*.flac' \
     -o -name '*.aiff' -o -name '*.m4a' \) -print

# Which audio files exist anywhere in history, on any branch
git log --all --diff-filter=A --name-only --pretty=format: \
  | grep -Ei '\.(wav|mp3|ogg|flac|aiff|m4a)$' | sort -u

# ...and whether any of them reached the published branch
git ls-tree -r main --name-only \
  | grep -Ei '\.(wav|mp3|ogg|flac|aiff|m4a)$'

# Dependency licences
pnpm licenses list --prod

# Known vulnerabilities
pnpm audit

# The rights notice shown in the app matches its canonical source
node scripts/sync-rights-notice.mjs --check

# Secret scanning: no committed key, token or credential, in the working
# tree or anywhere in history. CI (the "No secrets in history" job) uses
# gitleaks v8.30.1 with the repository's own .gitleaks.toml; install the same
# version locally from https://github.com/gitleaks/gitleaks/releases (this
# project does not install it for you).
gitleaks git . --no-banner --redact --exit-code 1        # full history
gitleaks dir . --no-banner --redact --exit-code 1         # working tree only

# The exports, by actually performing them in a browser: the pattern WAV, the
# SFZ instrument and its four samples, and a kept sound surviving a reload.
# Playwright is deliberately not a project dependency, so install it per run.
pnpm run build
npm install --no-save playwright
node scripts/verify-exports.mjs
```

That last one is the only check that covers what needs a browser — audio
rendering, the download, and the contents of the file you end up with. It found
two real faults the unit tests could not see: every exported instrument had a
silent cymbal, and the pattern WAV export produced nothing at all.

Most of the above runs in CI on every push and pull request
(`.github/workflows/ci.yml`): the web app, the audio-file check, the gitleaks
full-history scan and the dependency licences. Two checks are deliberately
outside it:

- **The exports script** (`scripts/verify-exports.mjs`) needs Playwright, which is
  deliberately not a project dependency — installing it per run adds real
  download weight. The same reason keeps `scripts/verify-electron-package.sh`
  in section 3 out of CI. Both are run by hand.

With the GitHub CLI:

```bash
gh pr list  --repo kuragepk/beatbayashi --state all
gh run list --repo kuragepk/beatbayashi            # if workflows exist
gh api repos/kuragepk/beatbayashi --jq '.visibility, .pushed_at'
git fetch --prune origin && git branch -r            # branches that still exist
```

## 6. What cannot be checked yet

Listing these is part of the point: an unverified claim is a defect, so they are named
rather than implied.

| Claim | Why it is unverified |
|---|---|
| The patterns sound like the genres they are named after | Subjective, and no musician has reviewed them |
| The desktop app can be distributed | The Linux AppImage is built and starts (section 3). macOS, Windows and code signing are untried |
| An exported SFZ loads in a sampler | The archive and its four samples are checked by `scripts/verify-exports.mjs`, never opened in sforzando or anything like it |
| The cymbal/hat/ride/crash/rimshot presets actually render sound at their tuned frequency, and the Wood Block's resonance slider doesn't throw across its corrected 0..1 range (ISSUE-BEATBOX-014) | `src/audio/AudioEngine.real.test.ts` checks both against the real `tone` package (not the spy fakes every other AudioEngine test uses) through `Tone.Offline`, but vitest's `environment: 'node'` has no `OfflineAudioContext` - the test file explains this and skips itself rather than failing. Needs a real browser to actually run |

As of 2026-09-21: `pnpm exec vitest run` passed 187 tests and skipped 2. These counts
change as tests are added — this paragraph is the one place they are written down;
everywhere else in this repository links here instead of repeating a number. None of
the tests can hear anything, so every claim about how the drums sound stays in the
first row of that table.

See the "Honest status" section of the [README](../README.md) for the same list in context.
