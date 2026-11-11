// SPDX-FileCopyrightText: 2026 BeatBayashi contributors
//
// SPDX-License-Identifier: MIT-0
export const RETRY_DELAYS_MS: number[];
export function sha256(buf: Buffer): string;
export function zipMembers(buf: Buffer, basename: string): { name: string; data: Buffer }[];
export function withRetries<T>(
  fn: () => Promise<T>,
  opts?: {
    delays?: number[];
    sleep?: (ms: number) => Promise<void>;
    onRetry?: (error: Error, nextTry: number, delayMs: number) => void;
  },
): Promise<T>;
export function run(opts?: {
  pins?: string;
  dest?: string;
  check?: boolean;
  allowLocal?: boolean;
  fetchBytes?: (url: string) => Promise<Buffer>;
  retryDelaysMs?: number[];
  sleep?: (ms: number) => Promise<void>;
  onRetry?: (error: Error, nextTry: number, delayMs: number) => void;
  attemptTimeoutMs?: number;
}): Promise<{ ok: string[]; fetched: string[]; missing: string[]; mismatch: string[]; errors: string[] }>;
