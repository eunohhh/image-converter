# image-converter

Convert images between JPEG / PNG / WebP / AVIF — including **HEIC** input — in Node.js.
Single-file or whole-folder batch mode.

- **Engine**: [`sharp`](https://sharp.pixelplumbing.com/) (libvips) for encoding.
- **HEIC input**: [`libheif-js`](https://www.npmjs.com/package/libheif-js) (pure-JS, no native deps).
- **Output formats**: `jpeg`, `png`, `webp`, `avif`.
- **Input formats**: everything `sharp` accepts (jpeg, png, webp, avif, tiff, gif, svg) **plus HEIC/HEIF**.

## Install

```bash
pnpm install
pnpm build
```

## CLI — single file

In this repo, the fastest way to run the CLI is via the script alias (no build needed — uses `tsx`):

```bash
pnpm image-convert photo.heic -f webp -q 80
pnpm image-convert photo.jpg  -f avif -q 60 -o out.avif
pnpm image-convert icon.png   -f jpeg -q 90
```

Equivalent invocations:

```bash
pnpm run image-convert photo.heic -f webp -q 80   # explicit `run`
pnpm convert          photo.heic -f webp -q 80    # alias
node dist/cli.js      photo.heic -f webp -q 80    # after `pnpm build`
```

To install globally (so `image-convert` works anywhere on your system):

```bash
pnpm build && pnpm link --global
image-convert photo.heic -f webp -q 80
```

> Note: `pnpm run <name>` only sees entries in `package.json#scripts`, not `#bin`. The `bin` field only activates when the package is installed as a dependency or linked globally — which is why we also expose `image-convert` as a script inside this repo.

## CLI — folder (batch mode)

Pass a folder path instead of a file and every supported image inside gets converted
**into the same folder** (new extension). Safe-by-default: if ANY file in the folder
looks like an image but isn't one we can handle, the run aborts **before writing anything**.

```bash
pnpm image-convert ./photos -f webp -q 80
```

Output (example):

```text
photos/beach.webp
photos/sunset.webp
photos/portrait.webp

converted: 3
skipped (same format): 1
skipped (non-image):   2
```

Behavior:

- **Top-level only** — subfolders are not recursed.
- **Overwrite** — existing output files are overwritten silently.
- **Skip same format** — files already in the target format are left alone (e.g. `a.webp` with `-f webp`).
- **Non-image files** (`.DS_Store`, `README.md`, …) are skipped silently.
- **Unsupported images halt the run** — e.g. `.bmp`, `.psd`, `.jxl`, `.jp2`, `.ico`, or HEIF with unknown brands. No files are written.
- Image detection is by **magic bytes**, not filename. A `.jpg` that is actually a PSD will be correctly flagged as unsupported.

## Flags

| Flag | Description |
|---|---|
| `-f, --format <fmt>` | `jpeg` \| `png` \| `webp` \| `avif` (required) |
| `-q, --quality <n>`  | 1–100 (default: jpeg/webp 80, avif 50) |
| `-e, --effort <n>`   | encoder effort — webp 0-6, avif 0-9, png 0-9 |
| `--lossless`         | webp / avif only |
| `-o, --output <path>`| output path (file mode only; ignored for folders) |

## Programmatic API

```ts
import { convert, convertDir, UnsupportedImagesError } from 'image-converter';

// Single file
await convert('photo.heic', {
  format: 'webp',
  quality: 80,
  output: 'photo.webp', // optional; Buffer is also returned
});

// Folder
try {
  const result = await convertDir({
    dir: './photos',
    format: 'webp',
    quality: 80,
  });
  console.log(result.converted.length, 'files written');
} catch (err) {
  if (err instanceof UnsupportedImagesError) {
    console.error(err.message); // includes every offending file + detected signature
  }
}
```

## Supported input matrix

| Signature | Handling |
|---|---|
| JPEG / PNG / WebP / AVIF / GIF / TIFF / SVG | sharp directly |
| HEIC / HEIF (brands: heic, heix, hevc, hevx, mif1, msf1, …) | decoded via libheif-js, encoded via sharp |
| BMP, PSD, JPEG-XL, JPEG 2000, ICO, unknown `ftyp` brands | recognized as **unsupported image** — aborts batch |
| Anything else | treated as non-image, silently skipped |

## Quality reference

| Format | Range | Default | Notes |
|---|---|---|---|
| JPEG  | 1-100 | 80 | `mozjpeg` encoder always enabled |
| PNG   | 1-100 | none | setting quality enables palette quantization |
| WebP  | 1-100 | 80 | use `--lossless` for perfect quality |
| AVIF  | 1-100 | 50 | slowest to encode; best compression |

## Notes on HEIC

- Only the **primary image** of a HEIC is converted (no burst sequences).
- EXIF orientation is respected (iPhone photos come out upright).
- `libheif-js` is LGPL-3.0 licensed; review licensing before redistributing.
