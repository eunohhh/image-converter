import libheif from 'libheif-js';

export interface DecodedHeic {
  data: Buffer;
  width: number;
  height: number;
  channels: 4;
}

export async function decodeHeic(buf: Buffer): Promise<DecodedHeic> {
  const decoder = new libheif.HeifDecoder();
  const images = decoder.decode(buf);
  if (!images.length) {
    throw new Error('HEIC decode failed: no images found in file');
  }
  const image = images[0]!;
  const width = image.get_width();
  const height = image.get_height();

  const rgba = await new Promise<Uint8ClampedArray>((resolve, reject) => {
    image.display(
      { data: new Uint8ClampedArray(width * height * 4), width, height },
      (out) => {
        if (!out) reject(new Error('HEIC decode failed: display() returned null'));
        else resolve(out.data);
      },
    );
  });

  return {
    data: Buffer.from(rgba.buffer, rgba.byteOffset, rgba.byteLength),
    width,
    height,
    channels: 4,
  };
}
