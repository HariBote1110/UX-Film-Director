import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const QUALITY_DIR = resolve(ROOT, '.codex/video-export-quality');
const E2E_RESULT_JSON = resolve(ROOT, '.codex/video-export-e2e/result.json');
const QUALITY_REPORT_JSON = resolve(QUALITY_DIR, 'quality-report.json');
const PSNR_LOG = resolve(QUALITY_DIR, 'psnr.log');
const SSIM_LOG = resolve(QUALITY_DIR, 'ssim.log');
const VMAF_LOG = resolve(QUALITY_DIR, 'vmaf.json');

const DEFAULT_VIDEO_PATH = '/Volumes/ExtendSSD-W/GX020052.MP4';
const OUTPUT_WIDTH = Number(process.env.UXFD_VIDEO_EXPORT_QUALITY_WIDTH ?? 1920);
const OUTPUT_HEIGHT = Number(process.env.UXFD_VIDEO_EXPORT_QUALITY_HEIGHT ?? 1080);
const OUTPUT_FPS = Number(process.env.UXFD_VIDEO_EXPORT_QUALITY_FPS ?? 60);
const DURATION_SECONDS = Number(process.env.UXFD_VIDEO_EXPORT_QUALITY_DURATION_SECONDS ?? 5);
const VIDEO_PATH = process.env.UXFD_VIDEO_EXPORT_QUALITY_VIDEO_PATH
  ? resolve(process.env.UXFD_VIDEO_EXPORT_QUALITY_VIDEO_PATH)
  : DEFAULT_VIDEO_PATH;
const VIDEO_PATCH_JSON = process.env.UXFD_VIDEO_EXPORT_QUALITY_VIDEO_PATCH_JSON ?? '';
const SKIP_EXPORT = process.env.UXFD_VIDEO_EXPORT_QUALITY_SKIP_EXPORT === '1';

const runCommand = (command, args, options = {}) => new Promise((resolveCommand, rejectCommand) => {
  const child = spawn(command, args, {
    cwd: options.cwd ?? ROOT,
    env: options.env ?? process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
  child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
  child.on('error', rejectCommand);
  child.on('close', (code) => {
    if (code === 0) {
      resolveCommand({ stdout, stderr, code });
      return;
    }
    rejectCommand(new Error(`${command} exited with ${code}\n${stderr || stdout}`));
  });
});

const ffescape = (value) => String(value).replace(/\\/g, '\\\\').replace(/:/g, '\\:').replace(/'/g, "\\'");

export const buildReferenceGeometry = ({
  outputWidth,
  outputHeight,
  objectX,
  objectY,
  objectWidth,
  objectHeight,
}) => {
  const objectRight = objectX + objectWidth;
  const objectBottom = objectY + objectHeight;
  const cropX = Math.max(0, -objectX);
  const cropY = Math.max(0, -objectY);
  const rightOverflow = Math.max(0, objectRight - outputWidth);
  const bottomOverflow = Math.max(0, objectBottom - outputHeight);
  return {
    cropX,
    cropY,
    padX: Math.max(0, objectX),
    padY: Math.max(0, objectY),
    canvasWidth: outputWidth + cropX + rightOverflow,
    canvasHeight: outputHeight + cropY + bottomOverflow,
  };
};

export const buildQualityFilter = ({
  outputWidth,
  outputHeight,
  fps,
  durationSeconds,
  objectX,
  objectY,
  objectWidth,
  objectHeight,
  metric,
  statsPath,
}) => {
  const geometry = buildReferenceGeometry({
    outputWidth,
    outputHeight,
    objectX,
    objectY,
    objectWidth,
    objectHeight,
  });
  const distorted = `[0:v]trim=duration=${durationSeconds},setpts=PTS-STARTPTS,fps=${fps},format=yuv420p[dist]`;
  const reference = [
    `[1:v]trim=duration=${durationSeconds},setpts=PTS-STARTPTS`,
    `scale=${objectWidth}:${objectHeight}`,
    'setsar=1',
    `pad=${geometry.canvasWidth}:${geometry.canvasHeight}:${geometry.padX}:${geometry.padY}:black`,
    `crop=${outputWidth}:${outputHeight}:${geometry.cropX}:${geometry.cropY}`,
    `fps=${fps}`,
    'format=yuv420p[ref]',
  ].join(',');
  if (metric === 'psnr') {
    return `${distorted};${reference};[dist][ref]psnr=stats_file='${ffescape(statsPath)}'[metric]`;
  }
  if (metric === 'ssim') {
    return `${distorted};${reference};[dist][ref]ssim=stats_file='${ffescape(statsPath)}'[metric]`;
  }
  return `${distorted};${reference};[dist][ref]libvmaf=log_fmt=json:log_path='${ffescape(statsPath)}'[metric]`;
};

const parseNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export const parseQualityMetrics = ({
  psnrStderr = '',
  ssimStderr = '',
  vmafJsonText = '',
}) => {
  const psnrMatches = [...psnrStderr.matchAll(/PSNR[^\n]*average:([0-9.]+|inf)[^\n]*min:([0-9.]+|inf)/g)];
  const psnr = psnrMatches.at(-1);
  const ssimMatches = [...ssimStderr.matchAll(/SSIM[^\n]*All:([0-9.]+)/g)];
  const ssim = ssimMatches.at(-1);
  let vmafMean = null;
  if (vmafJsonText.trim()) {
    try {
      const parsed = JSON.parse(vmafJsonText);
      vmafMean = parseNumber(parsed?.pooled_metrics?.vmaf?.mean);
    } catch {
      vmafMean = null;
    }
  }

  return {
    psnrAverage: psnr?.[1] === 'inf' ? Infinity : parseNumber(psnr?.[1]),
    psnrMin: psnr?.[2] === 'inf' ? Infinity : parseNumber(psnr?.[2]),
    ssimAll: parseNumber(ssim?.[1]),
    vmafMean,
  };
};

export const classifyQualityMetrics = (
  metrics,
  thresholds = {
    psnrAverage: 35,
    psnrMin: 28,
    ssimAll: 0.97,
    vmafMean: 85,
  }
) => {
  const checks = {
    psnrAverage: metrics.psnrAverage !== null && metrics.psnrAverage >= thresholds.psnrAverage,
    psnrMin: metrics.psnrMin !== null && metrics.psnrMin >= thresholds.psnrMin,
    ssimAll: metrics.ssimAll !== null && metrics.ssimAll >= thresholds.ssimAll,
    vmafMean: metrics.vmafMean === null || metrics.vmafMean >= thresholds.vmafMean,
  };
  return {
    thresholds,
    checks,
    passed: Object.values(checks).every(Boolean),
  };
};

const hasFfmpegFilter = async (name) => {
  const { stdout } = await runCommand('ffmpeg', ['-hide_banner', '-filters']);
  return new RegExp(`\\b${name}\\b`).test(stdout);
};

const runMetric = async ({ metric, exportedPath, sourcePath, videoGeometry, statsPath }) => {
  const filter = buildQualityFilter({
    outputWidth: OUTPUT_WIDTH,
    outputHeight: OUTPUT_HEIGHT,
    fps: OUTPUT_FPS,
    durationSeconds: DURATION_SECONDS,
    objectX: videoGeometry.objectX,
    objectY: videoGeometry.objectY,
    objectWidth: videoGeometry.objectWidth,
    objectHeight: videoGeometry.objectHeight,
    metric,
    statsPath,
  });
  return runCommand('ffmpeg', [
    '-hide_banner',
    '-nostats',
    '-i', exportedPath,
    '-i', sourcePath,
    '-filter_complex', filter,
    '-map', '[metric]',
    '-f', 'null',
    '-',
  ]);
};

const resolveVideoGeometry = (videoObject) => {
  const width = Number(videoObject?.width);
  const height = Number(videoObject?.height);
  const scaleX = Number(videoObject?.scaleX ?? 1);
  const scaleY = Number(videoObject?.scaleY ?? 1);
  const x = Number(videoObject?.x ?? 0);
  const y = Number(videoObject?.y ?? 0);
  if (![width, height, scaleX, scaleY, x, y].every(Number.isFinite)) {
    throw new Error(`E2E result did not include usable video geometry: ${JSON.stringify(videoObject)}`);
  }
  return {
    objectX: Math.round(x),
    objectY: Math.round(y),
    objectWidth: Math.round(width * scaleX),
    objectHeight: Math.round(height * scaleY),
  };
};

const runExportE2e = async () => {
  if (SKIP_EXPORT) return;
  await runCommand('node', ['scripts/run-video-export-e2e.mjs'], {
    env: {
      ...process.env,
      UXFD_VIDEO_EXPORT_E2E_VIDEO_PATH: VIDEO_PATH,
      UXFD_VIDEO_EXPORT_E2E_DURATION_SECONDS: String(DURATION_SECONDS),
      ...(VIDEO_PATCH_JSON ? { UXFD_VIDEO_EXPORT_E2E_VIDEO_PATCH_JSON: VIDEO_PATCH_JSON } : {}),
    },
  });
};

const main = async () => {
  if (!existsSync(VIDEO_PATH)) {
    throw new Error(`quality source video is missing: ${VIDEO_PATH}`);
  }
  rmSync(QUALITY_DIR, { recursive: true, force: true });
  mkdirSync(QUALITY_DIR, { recursive: true });

  await runExportE2e();
  if (!existsSync(E2E_RESULT_JSON)) {
    throw new Error(`video export E2E result is missing: ${E2E_RESULT_JSON}`);
  }
  const e2eResult = JSON.parse(readFileSync(E2E_RESULT_JSON, 'utf8'));
  if (!e2eResult.passed) {
    throw new Error(`video export E2E failed before quality comparison: ${JSON.stringify(e2eResult.error ?? e2eResult.exportResult)}`);
  }
  const exportedPath = e2eResult.outputPath;
  if (!existsSync(exportedPath)) {
    throw new Error(`exported video is missing: ${exportedPath}`);
  }
  const videoGeometry = resolveVideoGeometry(e2eResult.videoObject);

  const [psnrResult, ssimResult] = await Promise.all([
    runMetric({ metric: 'psnr', exportedPath, sourcePath: VIDEO_PATH, videoGeometry, statsPath: PSNR_LOG }),
    runMetric({ metric: 'ssim', exportedPath, sourcePath: VIDEO_PATH, videoGeometry, statsPath: SSIM_LOG }),
  ]);
  let vmafRan = false;
  let vmafError = null;
  if (await hasFfmpegFilter('libvmaf')) {
    try {
      await runMetric({ metric: 'vmaf', exportedPath, sourcePath: VIDEO_PATH, videoGeometry, statsPath: VMAF_LOG });
      vmafRan = true;
    } catch (error) {
      vmafError = error instanceof Error ? error.message : String(error);
    }
  }

  const metrics = parseQualityMetrics({
    psnrStderr: psnrResult.stderr,
    ssimStderr: ssimResult.stderr,
    vmafJsonText: existsSync(VMAF_LOG) ? readFileSync(VMAF_LOG, 'utf8') : '',
  });
  const classification = classifyQualityMetrics(metrics);
  const report = {
    passed: classification.passed,
    sourcePath: VIDEO_PATH,
    exportedPath,
    durationSeconds: DURATION_SECONDS,
    output: {
      width: OUTPUT_WIDTH,
      height: OUTPUT_HEIGHT,
      fps: OUTPUT_FPS,
      sizeBytes: statSync(exportedPath).size,
    },
    videoGeometry,
    metrics,
    classification,
    vmaf: {
      ran: vmafRan,
      error: vmafError,
    },
    logs: {
      psnr: PSNR_LOG,
      ssim: SSIM_LOG,
      vmaf: VMAF_LOG,
    },
    e2e: {
      exportDurationMs: e2eResult.exportDurationMs,
      exportFramesPerSecond: e2eResult.exportFramesPerSecond,
      progressSamples: e2eResult.progressSamples?.slice(0, 5) ?? [],
    },
  };
  writeFileSync(QUALITY_REPORT_JSON, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(report, null, 2));
  if (!classification.passed) {
    process.exitCode = 1;
  }
};

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exit(1);
  });
}
