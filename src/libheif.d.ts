declare module 'libheif-js' {
  interface HeifImage {
    get_width(): number;
    get_height(): number;
    display(
      target: { data: Uint8ClampedArray; width: number; height: number },
      cb: (out: { data: Uint8ClampedArray; width: number; height: number } | null) => void,
    ): void;
  }

  class HeifDecoder {
    decode(buf: Buffer | Uint8Array): HeifImage[];
  }

  const libheif: { HeifDecoder: typeof HeifDecoder };
  export default libheif;
}
