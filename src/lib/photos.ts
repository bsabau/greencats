import sharp from "sharp";

/** Larger photos are scaled down to this many pixels on the longer side. Plenty for a phone screen. */
export const MAX_PHOTO_SIDE = 2048;
// A small file can describe a huge picture, which takes gigabytes to decode. 50 megapixels is above any phone camera.
const MAX_INPUT_PIXELS = 50_000_000;

function imageType(b: Buffer): { ext: string; type: string; format: "png" | "jpeg" | "webp" } | null {
  if (b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { ext: "png", type: "image/png", format: "png" };
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { ext: "jpg", type: "image/jpeg", format: "jpeg" };
  if (b.subarray(0, 4).toString() === "RIFF" && b.subarray(8, 12).toString() === "WEBP") return { ext: "webp", type: "image/webp", format: "webp" };
  return null;
}

/**
 * Re-encodes a JPEG, PNG or WebP photo, or returns null if it isn't one or can't be read.
 * Re-encoding drops everything a phone embeds in a photo, including where it was taken.
 * rotate() first applies the stored orientation, so the picture stays the right way up.
 */
export async function cleanPhoto(original: Buffer): Promise<{ buffer: Buffer; ext: string; type: string } | null> {
  const kind = imageType(original);
  if (!kind) return null;
  const buffer = await sharp(original, { limitInputPixels: MAX_INPUT_PIXELS })
    .rotate()
    .resize({ width: MAX_PHOTO_SIDE, height: MAX_PHOTO_SIDE, fit: "inside", withoutEnlargement: true })
    .toFormat(kind.format)
    .toBuffer()
    .catch(() => null);
  return buffer && { buffer, ext: kind.ext, type: kind.type };
}
