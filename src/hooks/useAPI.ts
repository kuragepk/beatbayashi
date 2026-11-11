// SPDX-FileCopyrightText: 2026 BeatBayashi contributors
//
// SPDX-License-Identifier: MIT-0

import { useCallback } from 'react';

// This hook never calls itself; a caller decides when to reach out. App.tsx
// gates its own call behind the opt-in "Use backend" toggle (default off,
// ISSUE-BEATBOX-013) so a static deployment does not probe every visitor's
// localhost on load.
const API_BASE = 'http://localhost:8080/api';

// ISSUE-BEATBOX-028: bound how long a call can stay pending. Without this, an
// unreachable backend that accepts the TCP connection but never responds
// leaves the returned Promise pending forever and the UI stuck loading.
const FETCH_TIMEOUT_MS = 5000;

function fetchWithTimeout(input: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  return fetch(input, { ...init, signal: controller.signal }).finally(() => {
    clearTimeout(timer);
  });
}

interface Pattern {
  id?: string;
  name: string;
  bpm: number;
  bars: number;
  resolution: number;
  scale?: string;
  genre?: string;
  grid: string;
}

export const useAPI = () => {
  const getPatterns = useCallback(async (): Promise<Pattern[]> => {
    try {
      const response = await fetchWithTimeout(`${API_BASE}/patterns`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      console.error('Error fetching patterns:', error);
      return [];
    }
  }, []);

  const createPattern = useCallback(async (pattern: Pattern): Promise<Pattern | null> => {
    try {
      const response = await fetchWithTimeout(`${API_BASE}/patterns`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pattern),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      console.error('Error creating pattern:', error);
      return null;
    }
  }, []);

  const updatePattern = useCallback(async (id: string, pattern: Pattern): Promise<Pattern | null> => {
    try {
      const response = await fetchWithTimeout(`${API_BASE}/patterns/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pattern),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      console.error('Error updating pattern:', error);
      return null;
    }
  }, []);

  const deletePattern = useCallback(async (id: string): Promise<boolean> => {
    try {
      const response = await fetchWithTimeout(`${API_BASE}/patterns/${id}`, { method: 'DELETE' });
      return response.ok;
    } catch (error) {
      console.error('Error deleting pattern:', error);
      return false;
    }
  }, []);

  return { getPatterns, createPattern, updatePattern, deletePattern };
};
