import type { RustBackendVideoEncodeWriteFramePayload } from './rustBackendVideoEncodeControl';
import type { SharedVideoFrameWritableBridge } from './sharedVideoFrameWritableBridge';

export type RustBackendVideoEncodeSharedFrameWritableBridge = SharedVideoFrameWritableBridge;

export interface CreateRustBackendVideoEncodeSharedFrameWriterInput {
  sessionId: string;
  memoryId: string;
  width: number;
  height: number;
  fps: number;
  bridge?: RustBackendVideoEncodeSharedFrameWritableBridge;
}

export interface RustBackendVideoEncodeSharedFrameWriterWriteInput {
  frameIndex: number;
  timestampUs: number;
  rgbaBytes: Uint8Array;
}

export interface RustBackendVideoEncodeSharedFrameWriter {
  writeFrame: (
    input: RustBackendVideoEncodeSharedFrameWriterWriteInput
  ) => Promise<RustBackendVideoEncodeWriteFramePayload>;
  close: () => Promise<void>;
}

const SLOT_COUNT = 1;
const GPU_ROW_ALIGNMENT_BYTES = 256;

const alignTo = (value: number, alignment: number): number =>
  Math.ceil(value / alignment) * alignment;

const assertPositiveInteger = (name: string, value: number): void => {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
};

const copyTightRgbaRowsIntoPaddedFrame = ({
  source,
  width,
  height,
  rowByteLen,
  strideBytes,
  slotByteLen,
}: {
  source: Uint8Array;
  width: number;
  height: number;
  rowByteLen: number;
  strideBytes: number;
  slotByteLen: number;
}): Uint8Array => {
  const expectedByteLen = rowByteLen * height;
  if (source.byteLength !== expectedByteLen) {
    throw new Error(
      `RGBA byte length must be ${expectedByteLen} bytes for ${width}x${height}.`
    );
  }

  const padded = new Uint8Array(slotByteLen);
  for (let rowIndex = 0; rowIndex < height; rowIndex += 1) {
    const sourceOffset = rowIndex * rowByteLen;
    const targetOffset = rowIndex * strideBytes;
    padded.set(source.subarray(sourceOffset, sourceOffset + rowByteLen), targetOffset);
  }

  return padded;
};

export const createRustBackendVideoEncodeSharedFrameWriter = async ({
  sessionId,
  memoryId,
  width,
  height,
  bridge = window.sharedVideoFrame,
}: CreateRustBackendVideoEncodeSharedFrameWriterInput): Promise<RustBackendVideoEncodeSharedFrameWriter> => {
  assertPositiveInteger('width', width);
  assertPositiveInteger('height', height);

  const rowByteLen = width * 4;
  const strideBytes = alignTo(rowByteLen, GPU_ROW_ALIGNMENT_BYTES);
  const slotByteLen = strideBytes * height;
  const createResponse = await bridge.createWritableSharedFrameRing({
    memoryId,
    slotCount: SLOT_COUNT,
    slotByteLen,
  });
  if (!createResponse.success) {
    throw new Error(createResponse.error ?? 'Failed to create writable shared frame ring.');
  }

  let closed = false;

  return {
    async writeFrame({
      frameIndex,
      timestampUs,
      rgbaBytes,
    }: RustBackendVideoEncodeSharedFrameWriterWriteInput): Promise<RustBackendVideoEncodeWriteFramePayload> {
      if (closed) {
        throw new Error('Cannot write to a closed shared frame writer.');
      }

      const paddedFrame = copyTightRgbaRowsIntoPaddedFrame({
        source: rgbaBytes,
        width,
        height,
        rowByteLen,
        strideBytes,
        slotByteLen,
      });
      const writeResponse = await bridge.writeIntoSharedFrameRing({
        memoryId,
        ptsFrame: frameIndex,
      }, paddedFrame);
      if (!writeResponse.success) {
        throw new Error(writeResponse.error ?? 'Failed to write shared frame.');
      }

      return {
        sessionId,
        frameIndex,
        timestampUs,
        slotCount: SLOT_COUNT,
        frame: {
          descriptor: {
            memoryId,
            slotIndex: 0,
            generation: frameIndex + 1,
            byteOffset: 0,
            byteLen: slotByteLen,
            width,
            height,
            strideBytes,
            format: 'rgba8Srgb',
            colour: {
              primaries: 'bt709',
              transfer: 'srgb',
              matrix: 'rgb',
              range: 'full',
            },
          },
          ptsFrame: frameIndex,
        },
      };
    },
    async close(): Promise<void> {
      if (closed) {
        return;
      }
      closed = true;
      const closeResponse = await bridge.closeWritableSharedFrameRing({ memoryId });
      if (!closeResponse.success) {
        throw new Error(closeResponse.error ?? 'Failed to close writable shared frame ring.');
      }
    },
  };
};
