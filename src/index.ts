export { convert } from './convert.js';
export { convertDir, UnsupportedImagesError, OutputCollisionError } from './batch.js';
export { classifyFile, detectFormat } from './detect.js';
export { decodeHeic } from './heic.js';
export { OUTPUT_FORMATS } from './types.js';

export type { BatchOptions, BatchResult } from './batch.js';
export type { ImageKind, Classification, InputFormat } from './detect.js';
export type { ConvertOptions, OutputFormat } from './types.js';
