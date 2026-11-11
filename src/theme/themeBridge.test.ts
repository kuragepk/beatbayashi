// SPDX-FileCopyrightText: 2026 BeatBayashi contributors
//
// SPDX-License-Identifier: MIT-0
//
// Owner decision #72 (2026-09-27): SequencerGrid/ControlPanel/PresetDropdowns/
// PresetTable and the rest of src/components/ now read their colours through
// the --app-* bridge (theme-bridge.css) instead of hard-coded hex, so a
// preset theme actually restyles them. Two things need to hold:
//   1. the "modern" (unthemed) look is byte-identical to the frozen hex this
//      project always shipped -- switching to var(--app-*, #hex) must not
//      itself change anything (that CSS variable is unset in "modern", so
//      every var() falls through to its literal fallback)
//   2. the bridge is actually wired up (imported) and defines the roles the
//      components now depend on

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const BRIDGE_CSS = readFileSync(new URL('./theme-bridge.css', import.meta.url), 'utf8');
const MAIN_TS = readFileSync(new URL('./../main.tsx', import.meta.url), 'utf8');

describe('theme-bridge.css', () => {
  it('the in-app reduce-motion toggle also stops the step press shrink', () => {
    expect(BRIDGE_CSS).toMatch(
      /:root\[data-reduced-motion='true'\] \.bb-step:active\s*\{[^}]*transform:\s*none/
    );
  });

  it('is imported by the app entry point', () => {
    expect(MAIN_TS).toMatch(/theme-bridge\.css/);
  });

  it('defines every --app-* role the frozen default (modern) look used', () => {
    const requiredRoles = [
      'app-bg',
      'app-text',
      'app-panel',
      'app-control',
      'app-accent',
      'app-border',
      'app-danger',
      'app-ok',
      'app-focus',
      'app-muted',
    ];
    for (const role of requiredRoles) {
      expect(BRIDGE_CSS).toMatch(new RegExp(`--${role}:\\s*#`));
    }
  });

  it('only overrides --app-* roles for themes other than modern', () => {
    // "modern" sets none of --theme-color-*, so the do-nothing default block
    // (:root { --app-bg: #0a0a0a; ... }) is what a modern session actually
    // renders with -- the override block below must not also match modern.
    const overrideSelector = BRIDGE_CSS.match(
      /:root\[data-theme\]([^{]*)\{/
    )?.[1];
    expect(overrideSelector).toContain("not([data-theme='modern'])");
  });

  it('extends new roles (border-strong, panel-alt, on-accent, accent-dim/bright, danger-strong, selection) by mapping only to existing --theme-color-* roles, never a literal colour', () => {
    const extendedRoles = [
      'app-border-strong',
      'app-panel-alt',
      'app-on-accent',
      'app-accent-dim',
      'app-accent-bright',
      'app-danger-strong',
      'app-selection',
    ];
    for (const role of extendedRoles) {
      const line = BRIDGE_CSS.match(new RegExp(`--${role}:\\s*([^;]+);`));
      expect(line, `--${role} should be defined`).toBeTruthy();
      // No new hex value invented for these roles -- only var(--theme-color-*) refs.
      expect(line![1]).not.toMatch(/#[0-9a-fA-F]{3,8}/);
      expect(line![1]).toMatch(/var\(--theme-color-/);
    }
  });

  it('light mode: controls inherit one family, bold eases, and a chosen pixel font is left alone', () => {
    expect(BRIDGE_CSS).toMatch(
      /\[data-theme='paper-ink'\] :is\(button, input, select, textarea, option\)\s*\{\s*font-family:\s*inherit/
    );
    expect(BRIDGE_CSS).toMatch(
      /\[data-theme='paper-ink'\]:not\(\[data-font-pixel='true'\]\) body\s*\{[^}]*'Yu Gothic UI'[^}]*'Hiragino Sans'/
    );
    expect(BRIDGE_CSS).toMatch(/\[data-theme='paper-ink'\]:not\(\[data-font-pixel='true'\]\)\s+:is\([^)]*'font-weight: 700'/);
  });

  it('voice names are green outside the light theme and ink in it, with no new colour', () => {
    expect(BRIDGE_CSS).toMatch(/--app-voice-label:\s*var\(--app-ok, #2ba695\)/);
    expect(BRIDGE_CSS).toMatch(/\[data-theme='paper-ink'\]\s*\{\s*--app-voice-label:\s*var\(--app-text\)/);
  });

  it('stops CSS animations/transitions when data-reduced-motion is true', () => {
    expect(BRIDGE_CSS).toMatch(/data-reduced-motion='true'\]/);
    expect(BRIDGE_CSS).toMatch(/animation-duration:\s*0\.001ms\s*!important/);
    expect(BRIDGE_CSS).toMatch(/transition-duration:\s*0\.001ms\s*!important/);
  });
});
