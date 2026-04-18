export type ImageKind =
  | 'heic'              // decoded via libheif-js, then re-encoded with sharp
  | 'sharp-supported'   // sharp can ingest directly
  | 'unsupported-image' // recognizably an image but we don't support it
  | 'non-image';        // not an image at all — safe to skip

export type InputFormat = 'heic' | 'other';

export interface Classification {
  kind: ImageKind;
  /** The detected format name (e.g. "jpeg", "bmp"), or null for non-image. */
  signature: string | null;
}

const HEIF_HEIC_BRANDS = new Set([
  'heic', 'heix', 'hevc', 'hevx',
  'heim', 'heis', 'hevm', 'hevs',
  'mif1', 'msf1',
]);

const HEIF_AVIF_BRANDS = new Set(['avif', 'avis']);

export function classifyFile(buf: Buffer): Classification {
  // JPEG: FF D8 FF
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return { kind: 'sharp-supported', signature: 'jpeg' };
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
    buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a
  ) {
    return { kind: 'sharp-supported', signature: 'png' };
  }

  // GIF: GIF87a or GIF89a
  if (buf.length >= 6 && buf.toString('ascii', 0, 6) === 'GIF87a') {
    return { kind: 'sharp-supported', signature: 'gif' };
  }
  if (buf.length >= 6 && buf.toString('ascii', 0, 6) === 'GIF89a') {
    return { kind: 'sharp-supported', signature: 'gif' };
  }

  // WebP: 'RIFF' ???? 'WEBP'
  if (
    buf.length >= 12 &&
    buf.toString('ascii', 0, 4) === 'RIFF' &&
    buf.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return { kind: 'sharp-supported', signature: 'webp' };
  }

  // TIFF: II*\0 (little-endian) or MM\0* (big-endian)
  if (
    buf.length >= 4 &&
    ((buf[0] === 0x49 && buf[1] === 0x49 && buf[2] === 0x2a && buf[3] === 0x00) ||
      (buf[0] === 0x4d && buf[1] === 0x4d && buf[2] === 0x00 && buf[3] === 0x2a))
  ) {
    return { kind: 'sharp-supported', signature: 'tiff' };
  }

  // ISO-BMFF family: offset 4 'ftyp' + brand at offset 8
  if (buf.length >= 12 && buf.toString('ascii', 4, 8) === 'ftyp') {
    const brand = buf.toString('ascii', 8, 12);
    if (HEIF_AVIF_BRANDS.has(brand)) {
      return { kind: 'sharp-supported', signature: 'avif' };
    }
    if (HEIF_HEIC_BRANDS.has(brand)) {
      return { kind: 'heic', signature: 'heic' };
    }
    // Unknown ftyp brand — not something we can safely convert.
    return { kind: 'unsupported-image', signature: `ftyp:${brand}` };
  }

  // SVG: starts with <?xml or <svg (allow BOM + whitespace)
  if (looksLikeSvg(buf)) {
    return { kind: 'sharp-supported', signature: 'svg' };
  }

  // BMP: 'BM'
  if (buf.length >= 2 && buf[0] === 0x42 && buf[1] === 0x4d) {
    return { kind: 'unsupported-image', signature: 'bmp' };
  }

  // Photoshop PSD: '8BPS'
  if (buf.length >= 4 && buf.toString('ascii', 0, 4) === '8BPS') {
    return { kind: 'unsupported-image', signature: 'psd' };
  }

  // JPEG-XL naked codestream: FF 0A
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0x0a) {
    return { kind: 'unsupported-image', signature: 'jxl' };
  }
  // JPEG-XL ISOBMFF container: 00 00 00 0C 4A 58 4C 20 0D 0A 87 0A
  if (
    buf.length >= 12 &&
    buf[0] === 0x00 && buf[1] === 0x00 && buf[2] === 0x00 && buf[3] === 0x0c &&
    buf.toString('ascii', 4, 8) === 'JXL '
  ) {
    return { kind: 'unsupported-image', signature: 'jxl' };
  }

  // JPEG 2000: 00 00 00 0C 6A 50 20 20 0D 0A 87 0A
  if (
    buf.length >= 12 &&
    buf[0] === 0x00 && buf[1] === 0x00 && buf[2] === 0x00 && buf[3] === 0x0c &&
    buf.toString('ascii', 4, 8) === 'jP  '
  ) {
    return { kind: 'unsupported-image', signature: 'jp2' };
  }

  // ICO: 00 00 01 00
  if (
    buf.length >= 4 &&
    buf[0] === 0x00 && buf[1] === 0x00 && buf[2] === 0x01 && buf[3] === 0x00
  ) {
    return { kind: 'unsupported-image', signature: 'ico' };
  }

  return { kind: 'non-image', signature: null };
}

function looksLikeSvg(buf: Buffer): boolean {
  // Strip UTF-8 BOM if present.
  let start = 0;
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    start = 3;
  }
  // Scan the first 256 bytes for "<svg" or "<?xml".
  const window = buf.subarray(start, Math.min(buf.length, start + 256)).toString('utf8');
  const trimmed = window.replace(/^\s+/, '');
  return trimmed.startsWith('<?xml') || trimmed.startsWith('<svg');
}

/** Legacy helper kept for `convert()` — HEIC needs pre-decoding, everything else goes to sharp. */
export function detectFormat(buf: Buffer): InputFormat {
  return classifyFile(buf).kind === 'heic' ? 'heic' : 'other';
}
