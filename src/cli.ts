#!/usr/bin/env node
import { stat } from 'node:fs/promises';
import { extname, basename, dirname, join, relative } from 'node:path';
import { Command, InvalidArgumentError } from 'commander';
import { convert } from './convert.js';
import { convertDir, UnsupportedImagesError, OutputCollisionError } from './batch.js';
import { OUTPUT_FORMATS, type OutputFormat } from './types.js';

const program = new Command();

program
  .name('image-convert')
  .description('Convert an image (or every image in a folder) to JPEG / PNG / WebP / AVIF. HEIC input supported.')
  .argument('<path>', 'input image file OR folder of images')
  .requiredOption(
    '-f, --format <format>',
    `output format: ${OUTPUT_FORMATS.join(' | ')}`,
    parseFormat,
  )
  .option('-q, --quality <number>', 'quality 1-100 (jpeg/webp default 80, avif default 50)', parseIntInRange(1, 100))
  .option('-e, --effort <number>', 'encoder effort: webp 0-6, avif 0-9, png 0-9', parseIntInRange(0, 9))
  .option('--lossless', 'lossless mode (webp/avif only; ignored for jpeg)', false)
  .option('-o, --output <path>', 'output path (file mode only; ignored for folders)')
  .version(readVersion(), '-v, --version')
  .action(async (inputPath: string, opts: CliOpts) => {
    try {
      const st = await stat(inputPath).catch((err: NodeJS.ErrnoException) => {
        if (err.code === 'ENOENT') throw new Error(`Path not found: ${inputPath}`);
        throw err;
      });

      if (st.isDirectory()) {
        await runBatch(inputPath, opts);
      } else if (st.isFile()) {
        await runFile(inputPath, opts);
      } else {
        throw new Error(`Unsupported path type: ${inputPath}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`image-convert: ${msg}\n`);
      process.exitCode = 1;
    }
  });

program.parseAsync().catch((err) => {
  process.stderr.write(`image-convert: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});

async function runFile(inputPath: string, opts: CliOpts): Promise<void> {
  const output = opts.output ?? defaultOutputPath(inputPath, opts.format);
  await convert(inputPath, {
    format: opts.format,
    quality: opts.quality,
    effort: opts.effort,
    lossless: opts.lossless,
    output,
  });
  process.stdout.write(`${output}\n`);
}

async function runBatch(dir: string, opts: CliOpts): Promise<void> {
  if (opts.output) {
    process.stderr.write('image-convert: -o/--output is ignored in folder mode; files are written next to their sources.\n');
  }
  try {
    const result = await convertDir({
      dir,
      format: opts.format,
      quality: opts.quality,
      effort: opts.effort,
      lossless: opts.lossless,
    });
    const cwd = process.cwd();
    for (const { output } of result.converted) {
      process.stdout.write(`${relative(cwd, output)}\n`);
    }
    process.stdout.write(
      `\nconverted: ${result.converted.length}` +
        `\nskipped (same format): ${result.skippedSameFormat.length}` +
        `\nskipped (non-image):   ${result.skippedNonImage.length}\n`,
    );
  } catch (err) {
    if (err instanceof UnsupportedImagesError || err instanceof OutputCollisionError) {
      // Surface the structured list without the `image-convert:` prefix chaining twice.
      process.stderr.write(`${err.message}\n`);
      process.exitCode = 1;
      return;
    }
    throw err;
  }
}

interface CliOpts {
  format: OutputFormat;
  quality?: number;
  effort?: number;
  lossless?: boolean;
  output?: string;
}

function parseFormat(value: string): OutputFormat {
  const v = value.toLowerCase();
  if (v === 'jpg') return 'jpeg';
  if ((OUTPUT_FORMATS as readonly string[]).includes(v)) return v as OutputFormat;
  throw new InvalidArgumentError(
    `invalid format "${value}" (expected one of: ${OUTPUT_FORMATS.join(', ')})`,
  );
}

function parseIntInRange(lo: number, hi: number) {
  return (value: string): number => {
    const n = Number(value);
    if (!Number.isInteger(n) || n < lo || n > hi) {
      throw new InvalidArgumentError(`expected integer in [${lo}, ${hi}], got "${value}"`);
    }
    return n;
  };
}

function defaultOutputPath(input: string, format: OutputFormat): string {
  const ext = format === 'jpeg' ? 'jpg' : format;
  const base = basename(input, extname(input));
  return join(dirname(input), `${base}.${ext}`);
}

function readVersion(): string {
  return process.env.npm_package_version ?? '0.1.0';
}
