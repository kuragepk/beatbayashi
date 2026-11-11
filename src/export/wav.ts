// SPDX-FileCopyrightText: 2026 BeatBayashi contributors
// SPDX-License-Identifier: MIT-0
//
// 16-bit PCM WAV, written by hand.
//
// Browsers will record audio for you, but they record to whatever codec they
// feel like - usually WebM/Opus. A sampler asked to load that will refuse, and
// a file named .wav that is not a WAV is exactly the kind of "done" this
// project does not ship. So the bytes are written here, where they can be
// checked.

/**
 * Provenance text for an optional `LIST`/`INFO` chunk (finding 11, P1-1
 * licensing-provenance audit): the WAV a user exports otherwise carries
 * nothing saying where it came from once it leaves this app. `software`
 * becomes the `ISFT` subchunk (what made the file), `comment` becomes
 * `ICMT` (free text). Both are plain RIFF INFO tags that other tools
 * already know how to read and ignore.
 */
export interface WavMetadata {
  software?: string;
  comment?: string;
}

export interface RenderedAudio {
  sampleRate: number;
  /** One Float32Array per channel, all the same length, samples in -1..1. */
  channels: Float32Array[];
  /** Optional. Omitted: no `LIST` chunk is written, so callers that only
   *  care about the PCM data (and existing tests pinned to the 44-byte
   *  header) are unaffected. */
  metadata?: WavMetadata;
}

const HEADER_BYTES = 44;
const BITS_PER_SAMPLE = 16;

/** Clamp and convert one float sample to signed 16-bit. */
function toPcm16(sample: number): number {
  const clamped = Math.max(-1, Math.min(1, sample));
  // Asymmetric on purpose: 16-bit PCM runs -32768..32767, so scaling the
  // negative side by 32768 and the positive by 32767 avoids wrapping +1.0
  // round to -32768, which is an audible click at full scale.
  return Math.round(clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff);
}

/** One `LIST` `INFO` subchunk: 4-byte id, length, ASCII text, NUL
 *  terminator, then a zero pad byte if that left it at an odd length (RIFF
 *  chunks must start on an even offset). */
function infoSubchunk(id: string, value: string): number[] {
  const textBytes = Array.from(value, (char) => char.charCodeAt(0) & 0xff);
  textBytes.push(0); // NUL-terminated, per the RIFF INFO convention
  if (textBytes.length % 2 !== 0) textBytes.push(0);
  const bytes: number[] = [];
  for (let i = 0; i < 4; i++) bytes.push(id.charCodeAt(i));
  const len = value.length + 1; // declared length excludes the padding byte
  bytes.push(len & 0xff, (len >>> 8) & 0xff, (len >>> 16) & 0xff, (len >>> 24) & 0xff);
  bytes.push(...textBytes);
  return bytes;
}

/** Builds the full `LIST` chunk body (`INFO` + subchunks), or an empty
 *  array if there is nothing to write. */
function buildInfoList(metadata: WavMetadata | undefined): number[] {
  if (!metadata) return [];
  const subchunks: number[] = [];
  if (metadata.software) subchunks.push(...infoSubchunk('ISFT', metadata.software));
  if (metadata.comment) subchunks.push(...infoSubchunk('ICMT', metadata.comment));
  if (subchunks.length === 0) return [];
  const body = [0x49, 0x4e, 0x46, 0x4f, ...subchunks]; // 'INFO' + subchunks
  const chunk = [0x4c, 0x49, 0x53, 0x54]; // 'LIST'
  chunk.push(body.length & 0xff, (body.length >>> 8) & 0xff, (body.length >>> 16) & 0xff, (body.length >>> 24) & 0xff);
  chunk.push(...body);
  // LIST's own body length is already even (INFO is 4 bytes, subchunks are
  // padded to even), so no extra top-level pad byte is needed here.
  return chunk;
}

export function encodeWav({ sampleRate, channels, metadata }: RenderedAudio): Uint8Array {
  if (channels.length === 0) throw new Error('encodeWav: no channels');
  const frames = channels[0].length;
  if (channels.some((c) => c.length !== frames)) {
    throw new Error('encodeWav: channels differ in length');
  }

  const channelCount = channels.length;
  const blockAlign = channelCount * (BITS_PER_SAMPLE / 8);
  const dataBytes = frames * blockAlign;
  const listChunk = buildInfoList(metadata);
  const bytes = new Uint8Array(HEADER_BYTES + listChunk.length + dataBytes);
  const view = new DataView(bytes.buffer);

  const ascii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };

  ascii(0, 'RIFF');
  view.setUint32(4, 36 + listChunk.length + dataBytes, true); // everything after this field
  ascii(8, 'WAVE');

  ascii(12, 'fmt ');
  view.setUint32(16, 16, true);            // fmt chunk length
  view.setUint16(20, 1, true);             // 1 = uncompressed PCM
  view.setUint16(22, channelCount, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true); // byte rate
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, BITS_PER_SAMPLE, true);

  let dataChunkOffset = 36;
  if (listChunk.length > 0) {
    bytes.set(listChunk, dataChunkOffset);
    dataChunkOffset += listChunk.length;
  }

  ascii(dataChunkOffset, 'data');
  view.setUint32(dataChunkOffset + 4, dataBytes, true);

  let offset = dataChunkOffset + 8;
  for (let frame = 0; frame < frames; frame++) {
    for (let channel = 0; channel < channelCount; channel++) {
      view.setInt16(offset, toPcm16(channels[channel][frame]), true);
      offset += 2;
    }
  }

  return bytes;
}
