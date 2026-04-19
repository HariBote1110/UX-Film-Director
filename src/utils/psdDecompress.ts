/**
 * PSD layer decompressor — pure JS/TypeScript implementation.
 *
 * Mirrors psd_fast.rs:decode_layer_rgba() exactly.
 * V8 JIT optimises TypedArray loops significantly better than WASM
 * for the byte-at-a-time PackBits algorithm, giving ~2–3× speedup.
 *
 * Supports:
 *   compression 0 = raw
 *   compression 1 = PackBits RLE
 *   compression 2 = ZIP (raw deflate, no zlib header)
 *   compression 3 = ZIP + horizontal delta prediction
 * Depths: 8-bit and 16-bit (16-bit: high byte only, same as Rust impl)
 */

// ── PackBits ─────────────────────────────────────────────────────────────────

function decodePackBits(src: Uint8Array, expectedBytes: number): Uint8Array {
  const dst = new Uint8Array(expectedBytes);
  let i = 0;
  let o = 0;

  while (i < src.length && o < expectedBytes) {
    const header = src[i++];
    if (header <= 127) {
      // header + 1 literal bytes
      const n = header + 1;
      const end = Math.min(i + n, src.length);
      dst.set(src.subarray(i, end), o);
      o += end - i;
      i += n;
    } else if (header !== 128) {
      // 257 - header copies of the next byte  (header is treated as signed: 1 - (header - 256))
      const n = 257 - header;
      if (i < src.length) {
        dst.fill(src[i++], o, o + n);
        o += n;
      }
    }
    // 128 = no-op
  }

  return dst;
}

// ── ZIP (raw deflate) ─────────────────────────────────────────────────────────

async function decodeDeflate(compressed: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream('deflate-raw');
  const writer = ds.writable.getWriter();
  const reader = ds.readable.getReader();

  writer.write(compressed as unknown as Uint8Array<ArrayBuffer>);
  writer.close();

  const chunks: Uint8Array[] = [];
  let totalLen = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    totalLen += value.length;
  }

  const out = new Uint8Array(totalLen);
  let pos = 0;
  for (const chunk of chunks) { out.set(chunk, pos); pos += chunk.length; }
  return out;
}

// ── Delta-prediction undo (ZIP with prediction, comp=3) ───────────────────────

function undoDelta(raw: Uint8Array, width: number, height: number, depth: number): void {
  const bytesPerSample = depth === 16 ? 2 : 1;
  const stride = width * bytesPerSample;

  for (let row = 0; row < height; row++) {
    const base = row * stride;
    if (depth === 8) {
      for (let col = 1; col < width; col++) {
        raw[base + col] = (raw[base + col] + raw[base + col - 1]) & 0xff;
      }
    } else {
      // 16-bit big-endian pairs
      for (let col = 1; col < width; col++) {
        const prevHi = raw[base + (col - 1) * 2];
        const prevLo = raw[base + (col - 1) * 2 + 1];
        const prev = (prevHi << 8) | prevLo;
        const curHi = raw[base + col * 2];
        const curLo = raw[base + col * 2 + 1];
        const cur = (curHi << 8) | curLo;
        const val = (cur + prev) & 0xffff;
        raw[base + col * 2]     = (val >> 8) & 0xff;
        raw[base + col * 2 + 1] = val & 0xff;
      }
    }
  }
}

// ── Channel → RGBA interleaver ────────────────────────────────────────────────

function interleaveRgba(
  channelData: Array<{ id: number; plane: Uint8Array }>,
  pixelCount: number,
): Uint8Array {
  const rgba = new Uint8Array(pixelCount * 4).fill(255); // default: opaque

  for (const { id, plane } of channelData) {
    let component: number;
    if      (id === -1) component = 3; // alpha
    else if (id ===  0) component = 0; // R
    else if (id ===  1) component = 1; // G
    else if (id ===  2) component = 2; // B
    else continue;

    const n = Math.min(pixelCount, plane.length);
    for (let i = 0; i < n; i++) {
      rgba[i * 4 + component] = plane[i];
    }
  }

  return rgba;
}

// ── Public: decode one layer ──────────────────────────────────────────────────

export type LayerTask = {
  idx: number;
  offset: number;
  channelIds: number[];
  channelLens: number[];
  width: number;
  height: number;
};

/**
 * Decompress one PSD layer from a SharedArrayBuffer.
 *
 * @param psdBytes  View of the full PSD SharedArrayBuffer
 * @param task      Pre-computed channel offsets + sizes from WASM Phase 1
 * @param depth     Bit depth (8 or 16)
 * @param isPsb     true if PSB (version 2 — affects row-count byte width in PackBits)
 * @returns         RGBA Uint8Array (layer.width × layer.height × 4), or empty on error
 */
export async function decompressLayerJs(
  psdBytes: Uint8Array,
  task: LayerTask,
  depth: number,
  isPsb: boolean,
): Promise<Uint8Array> {
  const { width, height, channelIds, channelLens, offset } = task;
  const pixelCount = width * height;
  if (pixelCount === 0) return new Uint8Array(0);

  const bytesPerSample = depth === 16 ? 2 : 1;
  const channelData: Array<{ id: number; plane: Uint8Array }> = [];

  let pos = offset;

  for (let ci = 0; ci < channelIds.length; ci++) {
    const channelId  = channelIds[ci];
    const channelLen = channelLens[ci];
    const chEnd      = pos + channelLen;

    if (pos + 2 > psdBytes.length) break;
    const comp = (psdBytes[pos] << 8) | psdBytes[pos + 1];
    pos += 2;
    const payloadLen = channelLen - 2;

    let plane: Uint8Array;

    if (comp === 0) {
      // ── Raw ──
      const rawLen = pixelCount * bytesPerSample;
      const raw = psdBytes.subarray(pos, pos + rawLen);
      plane = depth === 8 ? new Uint8Array(raw) : new Uint8Array(raw.filter((_, i) => i % 2 === 0));
      pos += rawLen;

    } else if (comp === 1) {
      // ── PackBits ──
      const rowCountBytes = isPsb ? 4 : 2;
      const rowLens: number[] = [];
      for (let r = 0; r < height; r++) {
        if (isPsb) {
          rowLens.push(
            ((psdBytes[pos] << 24) | (psdBytes[pos+1] << 16) |
             (psdBytes[pos+2] << 8) | psdBytes[pos+3]) >>> 0
          );
        } else {
          rowLens.push((psdBytes[pos] << 8) | psdBytes[pos + 1]);
        }
        pos += rowCountBytes;
      }

      const rowPixels = width * bytesPerSample;
      const rawPlane  = new Uint8Array(pixelCount * bytesPerSample);
      let outRow = 0;

      for (const rlen of rowLens) {
        const rowData = psdBytes.subarray(pos, pos + rlen);
        const decoded = decodePackBits(rowData, rowPixels);
        rawPlane.set(decoded.subarray(0, rowPixels), outRow);
        outRow += rowPixels;
        pos += rlen;
      }

      plane = depth === 8 ? rawPlane : new Uint8Array(rawPlane.filter((_, i) => i % 2 === 0));

    } else if (comp === 2 || comp === 3) {
      // ── ZIP (raw deflate, no zlib header) ──
      const compressed = psdBytes.subarray(pos, pos + payloadLen);
      let raw = await decodeDeflate(new Uint8Array(compressed)); // copy: deflate needs detached buffer

      if (comp === 3) undoDelta(raw, width, height, depth);

      plane = depth === 8 ? raw : new Uint8Array(raw.filter((_, i) => i % 2 === 0));
      pos += payloadLen;

    } else {
      // Unknown compression — skip channel
      pos = chEnd;
      continue;
    }

    channelData.push({ id: channelId, plane });
    pos = chEnd; // ensure we're aligned even if parsing was imprecise
  }

  return interleaveRgba(channelData, pixelCount);
}
