import { readFile, writeFile } from 'node:fs/promises';
import sharp, { type Sharp } from 'sharp';
import { decodeHeic } from './heic.js';
import { detectFormat } from './detect.js';
import type { ConvertOptions, OutputFormat } from './types.js';

export async function convert(
  input: string | Buffer,
  options: ConvertOptions,
): Promise<Buffer> {
  const raw = typeof input === 'string' ? await readFile(input) : input;
  const inputFormat = detectFormat(raw);

  let pipeline: Sharp;
  if (inputFormat === 'heic') {
    const { data, width, height, channels } = await decodeHeic(raw);
    pipeline = sharp(data, { raw: { width, height, channels } });
  } else {
    pipeline = sharp(raw);
  }

  // Respect EXIF orientation so rotated phone photos come out upright.
  pipeline = pipeline.rotate();

  const encoded = applyFormat(pipeline, options);
  const buffer = await encoded.toBuffer();

  if (options.output) {
    await writeFile(options.output, buffer);
  }
  return buffer;
}

function applyFormat(pipeline: Sharp, opts: ConvertOptions): Sharp {
  const { format, quality, lossless, effort } = opts;
  switch (format) {
    case 'jpeg':
      return pipeline.jpeg({
        quality: quality ?? 80,
        mozjpeg: true,
      });
    case 'png':
      return pipeline.png({
        compressionLevel: clampCompression(effort),
        palette: quality !== undefined,
        ...(quality !== undefined ? { quality } : {}),
      });
    case 'webp':
      return pipeline.webp({
        quality: quality ?? 80,
        lossless: lossless ?? false,
        ...(effort !== undefined ? { effort: clamp(effort, 0, 6) } : {}),
      });
    case 'avif':
      return pipeline.avif({
        quality: quality ?? 50,
        lossless: lossless ?? false,
        ...(effort !== undefined ? { effort: clamp(effort, 0, 9) } : {}),
      });
    default: {
      const never: never = format;
      throw new Error(`Unsupported output format: ${never as OutputFormat}`);
    }
  }
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, Math.round(n)));
}

/** Map generic "effort" (0-9) onto PNG compressionLevel (0-9). Default 9. */
function clampCompression(effort: number | undefined): number {
  if (effort === undefined) return 9;
  return clamp(effort, 0, 9);
}
