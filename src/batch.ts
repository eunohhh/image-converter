import { readdir, stat, open } from 'node:fs/promises';
import { join, resolve, basename, extname } from 'node:path';
import { convert } from './convert.js';
import { classifyFile, type Classification } from './detect.js';
import type { ConvertOptions, OutputFormat } from './types.js';

export interface BatchOptions extends Omit<ConvertOptions, 'output'> {
  /** target directory (absolute or relative) */
  dir: string;
}

export interface BatchResult {
  dir: string;
  converted: { input: string; output: string }[];
  skippedSameFormat: string[];
  skippedNonImage: string[];
}

export class UnsupportedImagesError extends Error {
  constructor(public readonly files: { path: string; signature: string }[]) {
    super(formatUnsupported(files));
    this.name = 'UnsupportedImagesError';
  }
}

export class OutputCollisionError extends Error {
  constructor(public readonly collisions: { output: string; inputs: string[] }[]) {
    super(formatCollisions(collisions));
    this.name = 'OutputCollisionError';
  }
}

/** Bytes to sniff per file. Enough for SVG BOM + `<svg`/`<?xml` prefix. */
const SNIFF_BYTES = 256;

/** Map our detected signature to the OutputFormat name, for same-format skip checks. */
const SIGNATURE_TO_FORMAT: Record<string, OutputFormat> = {
  jpeg: 'jpeg',
  png: 'png',
  webp: 'webp',
  avif: 'avif',
};

export async function convertDir(opts: BatchOptions): Promise<BatchResult> {
  const { dir, ...convertOpts } = opts;
  const absDir = resolve(dir);

  const dirStat = await stat(absDir).catch((err: NodeJS.ErrnoException) => {
    if (err.code === 'ENOENT') {
      throw new Error(`Directory not found: ${absDir}`);
    }
    throw err;
  });
  if (!dirStat.isDirectory()) {
    throw new Error(`Not a directory: ${absDir}`);
  }

  const entries = await readdir(absDir, { withFileTypes: true });
  const files = entries.filter((e) => e.isFile()).map((e) => join(absDir, e.name));

  // Phase 1: sniff every file BEFORE writing anything.
  const scanned: { path: string; cls: Classification }[] = [];
  for (const path of files) {
    const cls = await sniff(path);
    scanned.push({ path, cls });
  }

  const unsupported = scanned
    .filter((s) => s.cls.kind === 'unsupported-image')
    .map((s) => ({ path: s.path, signature: s.cls.signature ?? 'unknown' }));

  if (unsupported.length > 0) {
    throw new UnsupportedImagesError(unsupported);
  }

  // Phase 2: plan output paths and detect collisions (two inputs → one output) before writing.
  const targetExt = opts.format === 'jpeg' ? 'jpg' : opts.format;
  const plan: { input: string; output: string }[] = [];
  const skippedSameFormat: string[] = [];
  const skippedNonImage: string[] = [];

  for (const { path, cls } of scanned) {
    if (cls.kind === 'non-image') {
      skippedNonImage.push(path);
      continue;
    }
    // Same-format skip: check by actual detected signature, not filename extension.
    if (cls.signature && SIGNATURE_TO_FORMAT[cls.signature] === opts.format) {
      skippedSameFormat.push(path);
      continue;
    }
    const output = join(absDir, `${basename(path, extname(path))}.${targetExt}`);
    plan.push({ input: path, output });
  }

  const byOutput = new Map<string, string[]>();
  for (const { input, output } of plan) {
    const bucket = byOutput.get(output) ?? [];
    bucket.push(input);
    byOutput.set(output, bucket);
  }
  const collisions = [...byOutput.entries()]
    .filter(([, inputs]) => inputs.length > 1)
    .map(([output, inputs]) => ({ output, inputs }));
  if (collisions.length > 0) {
    throw new OutputCollisionError(collisions);
  }

  // Phase 3: convert. Sequential — simpler, and per-file cost is sharp-bound anyway.
  const converted: BatchResult['converted'] = [];
  for (const { input, output } of plan) {
    await convert(input, { ...convertOpts, output });
    converted.push({ input, output });
  }

  return { dir: absDir, converted, skippedSameFormat, skippedNonImage };
}

async function sniff(path: string): Promise<Classification> {
  const fh = await open(path, 'r');
  try {
    const { buffer, bytesRead } = await fh.read(Buffer.alloc(SNIFF_BYTES), 0, SNIFF_BYTES, 0);
    return classifyFile(buffer.subarray(0, bytesRead));
  } finally {
    await fh.close();
  }
}

function formatUnsupported(files: { path: string; signature: string }[]): string {
  const lines = files.map((f) => `  - ${f.path} (${f.signature})`);
  return `Unsupported image files found (aborted without writing):\n${lines.join('\n')}`;
}

function formatCollisions(collisions: { output: string; inputs: string[] }[]): string {
  const blocks = collisions.map(
    (c) => `  ${c.output}\n${c.inputs.map((i) => `    <- ${i}`).join('\n')}`,
  );
  return (
    'Multiple inputs would produce the same output file ' +
    '(aborted without writing):\n' +
    blocks.join('\n')
  );
}
