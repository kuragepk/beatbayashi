// SPDX-FileCopyrightText: 2026 BeatBayashi contributors
//
// SPDX-License-Identifier: MIT-0
//
// Offline measurements of a rendered sound: peak, RMS, short-sound LUFS,
// spectral centroid, power shares under 2 kHz / 200-2 kHz / over 6 kHz, decay
// to -20 and -40 dB, and a kick's click-to-body ratio. Pure functions over
// samples; used by lab.ts (headless browser) and by the browser-only render
// test in src/audio/AudioEngine.real.test.ts.
import { measureShortSoundLoudness } from '@otoinki/loudness';

export interface RenderedAudio {
  sampleRate: number;
  channels: Float32Array[];
}

function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k;
        const b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci;
        const ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr;
        im[b] = im[a] - ti;
        re[a] += tr;
        im[a] += ti;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = ncr;
      }
    }
  }
}

const db = (x: number) => 20 * Math.log10(Math.max(x, 1e-12));
export const r2 = (x: number) => Math.round(x * 100) / 100;

export interface Metrics {
  peakDbfs: number;
  rmsDbfs: number;
  lufs: number;
  centroidHz: number;
  /** Share of total power, percent. */
  pctBelow2k: number;
  pctLowMid200to2k: number;
  pctAbove6k: number;
  /** Seconds from the loudest 5 ms window to the first window 20 / 40 dB lower. */
  decay20: number;
  decay40: number;
  durationActive: number;
  /** Power 1.5-8 kHz in the first 10 ms against 20-150 Hz over the first 250 ms, dB (a kick's click against its body). */
  clickToLowDb: number;
}

export function analyse(audio: RenderedAudio): Metrics {
  const sr = audio.sampleRate;
  const n = audio.channels[0].length;
  const mono = new Float64Array(n);
  let peak = 0;
  for (const ch of audio.channels) {
    for (let i = 0; i < n; i++) {
      mono[i] += ch[i] / audio.channels.length;
      peak = Math.max(peak, Math.abs(ch[i]));
    }
  }
  // 5 ms RMS envelope.
  const win = Math.round(sr * 0.005);
  const env: number[] = [];
  for (let s = 0; s + win <= n; s += win) {
    let e = 0;
    for (let i = s; i < s + win; i++) e += mono[i] * mono[i];
    env.push(Math.sqrt(e / win));
  }
  let peakIdx = 0;
  env.forEach((v, i) => {
    if (v > env[peakIdx]) peakIdx = i;
  });
  const first = (drop: number) => {
    const thr = env[peakIdx] * Math.pow(10, -drop / 20);
    // Last window above the threshold, not the first below it: a ringing
    // metal envelope wobbles around the threshold.
    let last = peakIdx;
    for (let i = peakIdx; i < env.length; i++) if (env[i] >= thr) last = i;
    return r2((last - peakIdx) * 0.005);
  };
  // Active region: until the envelope is 60 dB under its peak for good.
  const thr60 = env[peakIdx] * 1e-3;
  let activeEnd = peakIdx;
  for (let i = peakIdx; i < env.length; i++) if (env[i] >= thr60) activeEnd = i;
  const activeSamples = Math.max(win, (activeEnd + 1) * win);
  let sumSq = 0;
  for (let i = 0; i < Math.min(n, activeSamples); i++) sumSq += mono[i] * mono[i];
  const rms = Math.sqrt(sumSq / Math.min(n, activeSamples));

  // Averaged power spectrum over the active region.
  const N = 4096;
  const hann = new Float64Array(N).map((_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1)));
  const power = new Float64Array(N / 2);
  for (let s = 0; s < Math.min(n, activeSamples); s += N / 2) {
    const re = new Float64Array(N);
    const im = new Float64Array(N);
    for (let i = 0; i < N; i++) re[i] = (mono[s + i] ?? 0) * hann[i];
    fft(re, im);
    for (let k = 0; k < N / 2; k++) power[k] += re[k] * re[k] + im[k] * im[k];
  }
  let total = 0;
  let weighted = 0;
  let below2 = 0;
  let mid = 0;
  let above6 = 0;
  for (let k = 1; k < N / 2; k++) {
    const f = (k * sr) / N;
    total += power[k];
    weighted += power[k] * f;
    if (f < 2000) below2 += power[k];
    if (f >= 200 && f < 2000) mid += power[k];
    if (f >= 6000) above6 += power[k];
  }
  const bandPower = (from: number, to: number, start: number, len: number) => {
    const M = 8192;
    const n2 = Math.min(len, M);
    const re = new Float64Array(M);
    const im = new Float64Array(M);
    for (let i = 0; i < n2; i++) re[i] = (mono[start + i] ?? 0) * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n2 - 1)));
    fft(re, im);
    let sum = 0;
    for (let k = 1; k < M / 2; k++) {
      const f = (k * sr) / M;
      if (f >= from && f < to) sum += re[k] * re[k] + im[k] * im[k];
    }
    return sum / n2;
  };
  const clickToLowDb = 10 * Math.log10((bandPower(1500, 8000, 0, Math.round(sr * 0.01)) + 1e-30) / (bandPower(20, 150, 0, Math.round(sr * 0.25)) + 1e-30));
  const loud = measureShortSoundLoudness(audio.channels, sr, audio.channels.length);
  return {
    peakDbfs: r2(db(peak)),
    rmsDbfs: r2(db(rms)),
    lufs: r2(loud.integratedLufs),
    centroidHz: Math.round(weighted / Math.max(total, 1e-30)),
    pctBelow2k: r2((100 * below2) / Math.max(total, 1e-30)),
    pctLowMid200to2k: r2((100 * mid) / Math.max(total, 1e-30)),
    pctAbove6k: r2((100 * above6) / Math.max(total, 1e-30)),
    decay20: first(20),
    decay40: first(40),
    durationActive: r2(activeSamples / sr),
    clickToLowDb: r2(clickToLowDb),
  };
}

export function wavBase64(audio: RenderedAudio): string {
  const frames = audio.channels[0].length;
  const ch = audio.channels.length;
  const bytes = new Uint8Array(44 + frames * ch * 2);
  const view = new DataView(bytes.buffer);
  const tag = (o: number, s: string) => [...s].forEach((c, i) => view.setUint8(o + i, c.charCodeAt(0)));
  tag(0, 'RIFF');
  view.setUint32(4, 36 + frames * ch * 2, true);
  tag(8, 'WAVEfmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, ch, true);
  view.setUint32(24, audio.sampleRate, true);
  view.setUint32(28, audio.sampleRate * ch * 2, true);
  view.setUint16(32, ch * 2, true);
  view.setUint16(34, 16, true);
  tag(36, 'data');
  view.setUint32(40, frames * ch * 2, true);
  let o = 44;
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < ch; c++) {
      const v = Math.max(-1, Math.min(1, audio.channels[c][i]));
      view.setInt16(o, Math.round(v * 32767), true);
      o += 2;
    }
  }
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

