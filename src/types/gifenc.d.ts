declare module "gifenc" {
  export function GIFEncoder(): {
    writeFrame: (
      index: Uint8Array,
      width: number,
      height: number,
      options: { palette: number[][]; delay?: number },
    ) => void;
    finish: () => void;
    bytes: () => Uint8Array;
  };

  export function quantize(data: Uint8ClampedArray | Uint8Array, maxColors: number): number[][];
  export function applyPalette(data: Uint8ClampedArray | Uint8Array, palette: number[][]): Uint8Array;
}
