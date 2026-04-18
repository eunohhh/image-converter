export type OutputFormat = 'jpeg' | 'png' | 'webp' | 'avif';

export const OUTPUT_FORMATS: readonly OutputFormat[] = ['jpeg', 'png', 'webp', 'avif'];

export interface ConvertOptions {
  format: OutputFormat;
  /** 1-100. Defaults: jpeg/webp/png-palette 80, avif 50. Ignored in lossless mode. */
  quality?: number;
  /** Lossless encoding (webp, avif, png only). */
  lossless?: boolean;
  /** Encoder effort: webp 0-6 (default 5), avif 0-9 (default 4). Higher = slower, smaller. */
  effort?: number;
  /** If set, writes the result to this path. Always returns the Buffer too. */
  output?: string;
}
