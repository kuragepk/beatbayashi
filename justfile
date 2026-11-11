# SPDX-FileCopyrightText: 2026 BeatBayashi contributors
#
# SPDX-License-Identifier: MIT-0

# BeatBayashi — task runner
#
# `just` replaces remembering npm script names and long PowerShell one-liners.
# Run `just` with no arguments to see everything available.

set windows-shell := ["powershell.exe", "-NoLogo", "-NoProfile", "-Command"]

# Show every available task
default:
    @just --list

# Start the dev server on http://localhost:5173
dev:
    pnpm run dev

# Production build
build:
    pnpm run build

# Preview the production build
preview:
    pnpm run preview

# Type-check and lint
lint:
    pnpm run lint

# Build and lint together — the pre-commit check
check: build lint

# Search the source with ripgrep. Usage: just find useEffect
find PATTERN:
    rg --line-number --heading --color always "{{PATTERN}}" src

# List every source file of a given extension. Usage: just files tsx
files EXT="ts":
    fd --extension {{EXT}} . src

# How big is the shipped bundle?
size:
    @if (Test-Path dist) { Get-ChildItem dist -Recurse -File | Measure-Object -Property Length -Sum | ForEach-Object { "bundle: {0:N0} KB" -f ($_.Sum / 1KB) } } else { "no dist/ — run `just build` first" }

# How much disk is node_modules using?
deps-size:
    @Get-ChildItem node_modules -Recurse -File -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum | ForEach-Object { "node_modules: {0:N2} GB" -f ($_.Sum / 1GB) }

# Count the rhythm presets actually defined
presets:
    @rg --count-matches "^  p\(" src/presets.ts

# Ask the local LLM about this codebase. Usage: just ask "what does setBars do?"
ask QUESTION:
    ollama run qwen2.5-coder:7b "{{QUESTION}}"

# Remove build output (leaves node_modules alone)
clean:
    @if (Test-Path dist) { Remove-Item dist -Recurse -Force; "removed dist/" } else { "nothing to clean" }
