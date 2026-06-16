const output = document.getElementById("output");
const shaderPath = "/shared-renderer/shaders/solid_composite.wgsl";
const outputFormat = "rgba16float";
const sourceFormat = "rgba8unorm";
const bytesPerOutputPixel = 8;
const bytesPerSourcePixel = 4;
const perturbation = new URLSearchParams(window.location.search).get("perturb");

const cases = [
  {
    name: "red 50% over blue",
    width: 1,
    height: 1,
    clips: [
      {
        mediaId: "background",
        zIndex: 0,
        opacity: 1.0,
        gain: 1.0,
        pixels: [0, 0, 255, 255],
      },
      {
        mediaId: "foreground",
        zIndex: 1,
        opacity: 0.5,
        gain: 1.0,
        pixels: [255, 0, 0, 255],
      },
    ],
    expected: [188, 0, 188, 255],
  },
  {
    name: "white 50% over black",
    width: 1,
    height: 1,
    clips: [
      {
        mediaId: "background",
        zIndex: 0,
        opacity: 1.0,
        gain: 1.0,
        pixels: [0, 0, 0, 255],
      },
      {
        mediaId: "foreground",
        zIndex: 1,
        opacity: 0.5,
        gain: 1.0,
        pixels: [255, 255, 255, 255],
      },
    ],
    expected: [188, 188, 188, 255],
  },
  {
    name: "white 25% over black",
    width: 1,
    height: 1,
    clips: [
      {
        mediaId: "background",
        zIndex: 0,
        opacity: 1.0,
        gain: 1.0,
        pixels: [0, 0, 0, 255],
      },
      {
        mediaId: "foreground",
        zIndex: 1,
        opacity: 0.25,
        gain: 1.0,
        pixels: [255, 255, 255, 255],
      },
    ],
    expected: [137, 137, 137, 255],
  },
  {
    name: "source alpha times clip opacity",
    width: 1,
    height: 1,
    clips: [
      {
        mediaId: "background",
        zIndex: 0,
        opacity: 1.0,
        gain: 1.0,
        pixels: [0, 0, 0, 255],
      },
      {
        mediaId: "foreground",
        zIndex: 1,
        opacity: 0.5,
        gain: 1.0,
        pixels: [255, 255, 255, 128],
      },
    ],
    expected: [137, 137, 137, 255],
  },
  {
    name: "gain above one clamp",
    width: 1,
    height: 1,
    clips: [
      {
        mediaId: "foreground",
        zIndex: 0,
        opacity: 1.0,
        gain: 2.0,
        pixels: [203, 203, 203, 255],
      },
    ],
    expected: [255, 255, 255, 255],
  },
  {
    name: "two pixel coordinate mapping",
    width: 2,
    height: 1,
    clips: [
      {
        mediaId: "background",
        zIndex: 0,
        opacity: 1.0,
        gain: 1.0,
        pixels: [0, 0, 0, 255, 0, 0, 0, 255],
      },
      {
        mediaId: "foreground",
        zIndex: 1,
        opacity: 0.5,
        gain: 1.0,
        pixels: [255, 0, 0, 255, 0, 0, 255, 255],
      },
    ],
    expected: [188, 0, 0, 255, 0, 0, 188, 255],
  },
  {
    name: "integer translation and nearest scale",
    width: 5,
    height: 5,
    clips: [
      {
        mediaId: "foreground",
        zIndex: 0,
        opacity: 1.0,
        gain: 1.0,
        width: 2,
        height: 2,
        transform: {
          translationX: 1.0,
          translationY: 1.0,
          scaleX: 2.0,
          scaleY: 2.0,
        },
        pixels: [
          255, 0, 0, 255, 0, 255, 0, 255,
          0, 0, 255, 255, 255, 255, 255, 255,
        ],
      },
    ],
    expected: transformedNearestAnchor(),
  },
];

async function main() {
  if (!navigator.gpu) {
    throw new Error("navigator.gpu is unavailable");
  }

  const adapter = await navigator.gpu.requestAdapter({
    powerPreference: "high-performance",
  });
  if (!adapter) {
    throw new Error("WebGPU adapter is unavailable");
  }

  const device = await adapter.requestDevice();
  let shaderSource = await fetch(shaderPath).then((response) => {
    if (!response.ok) {
      throw new Error(`failed to fetch ${shaderPath}: ${response.status}`);
    }
    return response.text();
  });
  shaderSource = applyPerturbation(shaderSource, perturbation);
  const shaderModule = device.createShaderModule({
    label: "UXFD shared composite shader",
    code: shaderSource,
  });
  const pipeline = device.createRenderPipeline({
    label: "UXFD Phase3b pipeline",
    layout: "auto",
    vertex: {
      module: shaderModule,
      entryPoint: "vs_main",
    },
    fragment: {
      module: shaderModule,
      entryPoint: "fs_main",
      targets: [
        {
          format: outputFormat,
          blend: {
            color: {
              srcFactor: "one",
              dstFactor: "one-minus-src-alpha",
              operation: "add",
            },
            alpha: {
              srcFactor: "one",
              dstFactor: "one-minus-src-alpha",
              operation: "add",
            },
          },
        },
      ],
    },
    primitive: {
      topology: "triangle-list",
    },
  });

  const results = [];
  for (const testCase of cases) {
    const actual = await renderCase(device, pipeline, testCase);
    const comparison = compareRgba(testCase.expected, actual);
    results.push({
      name: testCase.name,
      passed: comparison.maxDelta <= 1,
      expected: testCase.expected,
      actual,
      ...comparison,
    });
  }

  const failed = results.filter((result) => !result.passed);
  const payload = {
    ok: failed.length === 0,
    perturbation,
    userAgent: navigator.userAgent,
    gpu: {
      adapterInfo: await readAdapterInfo(adapter),
      isFallbackAdapter: adapter.isFallbackAdapter ?? null,
    },
    results,
  };

  window.__UXFD_PHASE3B_RESULT__ = payload;
  output.textContent = JSON.stringify(payload, null, 2);

  if (failed.length > 0) {
    console.error(`Phase3b failed: ${failed.map((result) => result.name).join(", ")}`);
  }
}

function applyPerturbation(shaderSource, mode) {
  if (mode !== "red-plus") {
    return shaderSource;
  }

  return shaderSource.replace(
    "let premultiplied_rgb = linear_rgb * params.gain * alpha;",
    "let premultiplied_rgb = (linear_rgb * params.gain * alpha) + vec3<f32>(0.01, 0.0, 0.0);",
  );
}

async function renderCase(device, pipeline, testCase) {
  const outputTexture = device.createTexture({
    label: `output: ${testCase.name}`,
    size: [testCase.width, testCase.height, 1],
    format: outputFormat,
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
  });
  const outputView = outputTexture.createView();
  const encoder = device.createCommandEncoder({
    label: `encoder: ${testCase.name}`,
  });
  const pass = encoder.beginRenderPass({
    label: `pass: ${testCase.name}`,
    colorAttachments: [
      {
        view: outputView,
        clearValue: [0, 0, 0, 0],
        loadOp: "clear",
        storeOp: "store",
      },
    ],
  });
  pass.setPipeline(pipeline);

  for (const clip of [...testCase.clips].sort((left, right) => left.zIndex - right.zIndex)) {
    const sourceTexture = createSourceTexture(device, testCase, clip);
    const paramsBuffer = createParamsBuffer(device, testCase, clip);
    const bindGroup = device.createBindGroup({
      label: `bind group: ${testCase.name} ${clip.mediaId}`,
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        {
          binding: 0,
          resource: sourceTexture.createView(),
        },
        {
          binding: 1,
          resource: {
            buffer: paramsBuffer,
          },
        },
      ],
    });
    pass.setBindGroup(0, bindGroup);
    pass.draw(3);
  }

  pass.end();

  const paddedBytesPerRow = align(testCase.width * bytesPerOutputPixel, 256);
  const readbackBuffer = device.createBuffer({
    label: `readback: ${testCase.name}`,
    size: paddedBytesPerRow * testCase.height,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  });
  encoder.copyTextureToBuffer(
    {
      texture: outputTexture,
    },
    {
      buffer: readbackBuffer,
      bytesPerRow: paddedBytesPerRow,
      rowsPerImage: testCase.height,
    },
    {
      width: testCase.width,
      height: testCase.height,
      depthOrArrayLayers: 1,
    },
  );

  device.queue.submit([encoder.finish()]);
  await readbackBuffer.mapAsync(GPUMapMode.READ);
  const mapped = new Uint8Array(readbackBuffer.getMappedRange());
  const pixels = [];
  for (let y = 0; y < testCase.height; y += 1) {
    const rowStart = y * paddedBytesPerRow;
    for (let x = 0; x < testCase.width; x += 1) {
      const pixelStart = rowStart + x * bytesPerOutputPixel;
      const red = halfToFloat(readUint16Le(mapped, pixelStart));
      const green = halfToFloat(readUint16Le(mapped, pixelStart + 2));
      const blue = halfToFloat(readUint16Le(mapped, pixelStart + 4));
      const alpha = halfToFloat(readUint16Le(mapped, pixelStart + 6));
      pixels.push(...premultipliedToStraightRgba8(red, green, blue, alpha));
    }
  }
  readbackBuffer.unmap();
  outputTexture.destroy();
  readbackBuffer.destroy();
  return pixels;
}

function createSourceTexture(device, testCase, clip) {
  const sourceWidth = clip.width ?? testCase.width;
  const sourceHeight = clip.height ?? testCase.height;
  const texture = device.createTexture({
    label: `source: ${testCase.name} ${clip.mediaId}`,
    size: [sourceWidth, sourceHeight, 1],
    format: sourceFormat,
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
  });
  device.queue.writeTexture(
    {
      texture,
    },
    new Uint8Array(clip.pixels),
    {
      bytesPerRow: sourceWidth * bytesPerSourcePixel,
      rowsPerImage: sourceHeight,
    },
    {
      width: sourceWidth,
      height: sourceHeight,
      depthOrArrayLayers: 1,
    },
  );
  return texture;
}

function createParamsBuffer(device, testCase, clip) {
  const sourceWidth = clip.width ?? testCase.width;
  const sourceHeight = clip.height ?? testCase.height;
  const transform = clip.transform ?? {
    translationX: 0,
    translationY: 0,
    scaleX: 1,
    scaleY: 1,
  };
  const params = new Float32Array([
    clip.opacity,
    clip.gain,
    sourceWidth,
    sourceHeight,
    transform.translationX,
    transform.translationY,
    transform.scaleX,
    transform.scaleY,
  ]);
  const buffer = device.createBuffer({
    label: `params: ${clip.mediaId}`,
    size: params.byteLength,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(buffer, 0, params);
  return buffer;
}

async function readAdapterInfo(adapter) {
  if (adapter.info) {
    return copyAdapterInfo(adapter.info);
  }

  if (typeof adapter.requestAdapterInfo !== "function") {
    return null;
  }

  try {
    return copyAdapterInfo(await adapter.requestAdapterInfo());
  } catch {
    return null;
  }
}

function copyAdapterInfo(info) {
  return {
    vendor: info.vendor ?? null,
    architecture: info.architecture ?? null,
    device: info.device ?? null,
    description: info.description ?? null,
    isFallbackAdapter: info.isFallbackAdapter ?? null,
  };
}

function compareRgba(expected, actual) {
  let maxDelta = 0;
  let absoluteSum = 0;
  for (let index = 0; index < expected.length; index += 1) {
    const delta = Math.abs(expected[index] - actual[index]);
    maxDelta = Math.max(maxDelta, delta);
    absoluteSum += delta;
  }
  return {
    maxDelta,
    meanAbsoluteError: absoluteSum / expected.length,
  };
}

function transformedNearestAnchor() {
  const source = [
    [255, 0, 0, 255],
    [0, 255, 0, 255],
    [0, 0, 255, 255],
    [255, 255, 255, 255],
  ];
  const pixels = [];
  for (let y = 0; y < 5; y += 1) {
    for (let x = 0; x < 5; x += 1) {
      const sourceX = Math.floor((x - 1) / 2);
      const sourceY = Math.floor((y - 1) / 2);
      if (sourceX < 0 || sourceY < 0 || sourceX >= 2 || sourceY >= 2) {
        pixels.push(0, 0, 0, 0);
      } else {
        pixels.push(...source[sourceY * 2 + sourceX]);
      }
    }
  }
  return pixels;
}

function premultipliedToStraightRgba8(red, green, blue, alpha) {
  if (alpha <= 0) {
    return [0, 0, 0, 0];
  }

  return [
    linearToSrgbU8(red / alpha),
    linearToSrgbU8(green / alpha),
    linearToSrgbU8(blue / alpha),
    encodeUnorm8(alpha),
  ];
}

function linearToSrgbU8(value) {
  const linear = clamp01(value);
  const encoded =
    linear <= 0.0031308
      ? linear * 12.92
      : 1.055 * linear ** (1 / 2.4) - 0.055;
  return encodeUnorm8(encoded);
}

function encodeUnorm8(value) {
  return Math.round(clamp01(value) * 255);
}

function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}

function align(value, alignment) {
  return Math.ceil(value / alignment) * alignment;
}

function readUint16Le(bytes, offset) {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function halfToFloat(value) {
  const sign = (value & 0x8000) ? -1 : 1;
  const exponent = (value >> 10) & 0x1f;
  const fraction = value & 0x03ff;

  if (exponent === 0) {
    if (fraction === 0) {
      return sign * 0;
    }
    return sign * 2 ** -14 * (fraction / 1024);
  }

  if (exponent === 0x1f) {
    return fraction === 0 ? sign * Infinity : NaN;
  }

  return sign * 2 ** (exponent - 15) * (1 + fraction / 1024);
}

main().catch((error) => {
  const payload = {
    ok: false,
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : null,
  };
  window.__UXFD_PHASE3B_RESULT__ = payload;
  output.textContent = JSON.stringify(payload, null, 2);
  console.error(error);
});
