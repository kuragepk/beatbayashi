// SPDX-FileCopyrightText: 2026 BeatBayashi contributors
// SPDX-License-Identifier: MIT-0
//
// Contract tests for useAPI against docs/API-CONTRACT.md. This hook is the
// only place in the web app that talks to the pattern API, so what it sends
// and how it reads a response is what has to match mock-backend.js and the
// Spring service — checked end to end in scripts/api-contract.test.mjs, but
// only from the server side. Here `fetch` is stubbed, so what is asserted is
// the request shape (method, path, headers, body) and how each response
// status is turned into the hook's return value, not a live server.
//
// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAPI } from './useAPI';

const API_BASE = 'http://localhost:8080/api';

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

describe('useAPI contract', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('getPatterns', () => {
    it('GETs /api/patterns with no body and returns the array as-is', async () => {
      const patterns = [{ id: 'p1', name: 'A', bpm: 120, bars: 2, resolution: 16, grid: '[]' }];
      fetchMock.mockResolvedValueOnce(jsonResponse(200, patterns));

      const { result } = renderHook(() => useAPI());
      let returned: unknown;
      await act(async () => {
        returned = await result.current.getPatterns();
      });

      expect(fetchMock).toHaveBeenCalledWith(`${API_BASE}/patterns`, {
        signal: expect.any(AbortSignal),
      });
      expect(returned).toEqual(patterns);
    });

    it('returns an empty array rather than throwing on a non-ok status', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse(500, { error: 'boom' }));

      const { result } = renderHook(() => useAPI());
      let returned: unknown;
      await act(async () => {
        returned = await result.current.getPatterns();
      });

      expect(returned).toEqual([]);
    });

    it('returns an empty array rather than throwing when fetch itself rejects', async () => {
      fetchMock.mockRejectedValueOnce(new Error('network down'));

      const { result } = renderHook(() => useAPI());
      let returned: unknown;
      await act(async () => {
        returned = await result.current.getPatterns();
      });

      expect(returned).toEqual([]);
    });

    it('returns an empty array instead of hanging when fetch never resolves (timeout)', async () => {
      vi.useFakeTimers();
      try {
        fetchMock.mockImplementationOnce((_input: string, init?: RequestInit) => {
          return new Promise((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => {
              reject(new DOMException('The operation was aborted.', 'AbortError'));
            });
          });
        });

        const { result } = renderHook(() => useAPI());
        let returned: unknown;
        const call = act(async () => {
          returned = await result.current.getPatterns();
        });

        await vi.advanceTimersByTimeAsync(5000);
        await call;

        expect(returned).toEqual([]);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('createPattern', () => {
    const pattern = { name: 'New', bpm: 128, bars: 1, resolution: 16, grid: '[]' };

    it('POSTs /api/patterns as JSON and returns the stored pattern including its id', async () => {
      const stored = { ...pattern, id: 'pattern-1' };
      fetchMock.mockResolvedValueOnce(jsonResponse(201, stored));

      const { result } = renderHook(() => useAPI());
      let returned: unknown;
      await act(async () => {
        returned = await result.current.createPattern(pattern);
      });

      expect(fetchMock).toHaveBeenCalledWith(`${API_BASE}/patterns`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pattern),
        signal: expect.any(AbortSignal),
      });
      expect(returned).toEqual(stored);
    });

    it('returns null rather than throwing on a non-ok status', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse(400, { error: 'bad request' }));

      const { result } = renderHook(() => useAPI());
      let returned: unknown;
      await act(async () => {
        returned = await result.current.createPattern(pattern);
      });

      expect(returned).toBeNull();
    });
  });

  describe('updatePattern', () => {
    it('PUTs /api/patterns/{id} as JSON and returns the updated pattern', async () => {
      const partial = { name: 'Renamed', bpm: 128, bars: 1, resolution: 16, grid: '[]' };
      const updated = { ...partial, id: 'pattern-1' };
      fetchMock.mockResolvedValueOnce(jsonResponse(200, updated));

      const { result } = renderHook(() => useAPI());
      let returned: unknown;
      await act(async () => {
        returned = await result.current.updatePattern('pattern-1', partial);
      });

      expect(fetchMock).toHaveBeenCalledWith(`${API_BASE}/patterns/pattern-1`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(partial),
        signal: expect.any(AbortSignal),
      });
      expect(returned).toEqual(updated);
    });

    it('returns null for an id the server reports missing (404)', async () => {
      const partial = { name: 'Renamed', bpm: 128, bars: 1, resolution: 16, grid: '[]' };
      fetchMock.mockResolvedValueOnce(jsonResponse(404, { error: 'not found' }));

      const { result } = renderHook(() => useAPI());
      let returned: unknown;
      await act(async () => {
        returned = await result.current.updatePattern('does-not-exist', partial);
      });

      expect(returned).toBeNull();
    });
  });

  describe('deletePattern', () => {
    it('DELETEs /api/patterns/{id} and reports success as a boolean, not the response body', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse(204, undefined));

      const { result } = renderHook(() => useAPI());
      let returned: unknown;
      await act(async () => {
        returned = await result.current.deletePattern('pattern-1');
      });

      expect(fetchMock).toHaveBeenCalledWith(`${API_BASE}/patterns/pattern-1`, {
        method: 'DELETE',
        signal: expect.any(AbortSignal),
      });
      expect(returned).toBe(true);
    });

    it('returns false for a 404 rather than throwing', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse(404, undefined));

      const { result } = renderHook(() => useAPI());
      let returned: unknown;
      await act(async () => {
        returned = await result.current.deletePattern('does-not-exist');
      });

      expect(returned).toBe(false);
    });

    it('returns false rather than throwing when fetch itself rejects', async () => {
      fetchMock.mockRejectedValueOnce(new Error('network down'));

      const { result } = renderHook(() => useAPI());
      let returned: unknown;
      await act(async () => {
        returned = await result.current.deletePattern('pattern-1');
      });

      expect(returned).toBe(false);
    });

    it('returns false instead of hanging when fetch never resolves (timeout)', async () => {
      vi.useFakeTimers();
      try {
        fetchMock.mockImplementationOnce((_input: string, init?: RequestInit) => {
          return new Promise((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => {
              reject(new DOMException('The operation was aborted.', 'AbortError'));
            });
          });
        });

        const { result } = renderHook(() => useAPI());
        let returned: unknown;
        const call = act(async () => {
          returned = await result.current.deletePattern('pattern-1');
        });

        await vi.advanceTimersByTimeAsync(5000);
        await call;

        expect(returned).toBe(false);
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
