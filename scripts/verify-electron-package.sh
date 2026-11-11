#!/usr/bin/env bash

# SPDX-FileCopyrightText: 2026 BeatBayashi contributors
#
# SPDX-License-Identifier: MIT-0

# Packages the desktop app and starts the packaged binary, to check that it
# renders the real UI rather than a blank window.
#
#   scripts/verify-electron-package.sh
#
# README.md said for a long time that packaging had never produced a release
# build. It had never been attempted in a way that recorded the outcome, so
# this records it: electron-builder produces the AppImage, the binary is run
# under a virtual display, and the rendered DOM is read back over the DevTools
# protocol. A window that opens on a white page passes a "did it start" check
# and fails this one.
#
# Linux only. It needs xvfb-run, and electron-builder downloads about 200 MB
# the first time. That is why CI does not run it.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# The app is beatbayashi/ in the main repository and the root in the public copy.
app="$repo_root/beatbayashi"
[ -f "$app/package.json" ] || app="$repo_root"
port="${ORB_ELECTRON_DEBUG_PORT:-9222}"
binary="$app/release/linux-unpacked/beatbayashi"
log="$(mktemp)"

command -v xvfb-run >/dev/null || { echo "xvfb-run is not installed"; exit 1; }

echo "Building..."
(cd "$app" && pnpm run build >/dev/null && pnpm exec electron-builder --linux AppImage >/dev/null)
[ -x "$binary" ] || { echo "no packaged binary at $binary"; exit 1; }
ls "$app/release/"*.AppImage >/dev/null || { echo "no AppImage produced"; exit 1; }

echo "Starting the packaged app..."
xvfb-run -a "$binary" --no-sandbox --remote-debugging-port="$port" >"$log" 2>&1 &
app_pid=$!
trap 'kill "$app_pid" 2>/dev/null || true' EXIT

target=""
for _ in $(seq 1 30); do
  sleep 1
  target="$(curl -s --noproxy '*' "http://127.0.0.1:$port/json" 2>/dev/null || true)"
  [ -n "$target" ] && break
done
[ -n "$target" ] || { echo "the app never opened a debuggable page"; cat "$log"; exit 1; }

ws="$(printf '%s' "$target" | node -e '
let raw = ""
process.stdin.on("data", d => raw += d)
process.stdin.on("end", () => {
  const page = JSON.parse(raw).find(t => t.type === "page")
  if (!page) { console.error("no page target"); process.exit(1) }
  process.stdout.write(page.webSocketDebuggerUrl)
})')"

node -e '
const ws = new WebSocket(process.argv[1])
const read = "JSON.stringify({title: document.title, nodes: document.querySelectorAll(\"#root *\").length, text: document.body.innerText.slice(0, 120)})"
ws.onopen = () => ws.send(JSON.stringify({id: 1, method: "Runtime.evaluate", params: {expression: read, returnByValue: true}}))
ws.onmessage = (event) => {
  const message = JSON.parse(event.data)
  if (message.id !== 1) return
  const rendered = JSON.parse(message.result.result.value)
  console.log(rendered)
  // A blank page still has a title and a #root, so the node count is the check.
  process.exit(rendered.nodes > 50 ? 0 : 1)
}
setTimeout(() => { console.error("the page never answered"); process.exit(1) }, 15000)
' "$ws"

echo "OK - the packaged app renders the UI."
