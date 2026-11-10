import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { MAX_PHOTO_SIDE, cleanPhoto } from "../src/lib/photos";

const image = (width: number, height: number, format: "jpeg" | "png" = "jpeg") =>
  sharp({ create: { width, height, channels: 3, background: { r: 120, g: 160, b: 90 } } }).toFormat(format).toBuffer();

describe("photo cleaning", () => {
  it("scales a large photo down to the maximum side and keeps the proportions", async () => {
    const out = await cleanPhoto(await image(4000, 3000));
    const meta = await sharp(out!.buffer).metadata();
    expect([meta.width, meta.height]).toEqual([MAX_PHOTO_SIDE, 1536]);
    expect(out!.type).toBe("image/jpeg");
  });

  it("leaves a small photo at its size", async () => {
    const out = await cleanPhoto(await image(800, 600, "png"));
    const meta = await sharp(out!.buffer).metadata();
    expect([meta.width, meta.height, meta.format]).toEqual([800, 600, "png"]);
  });

  it("drops the location and other metadata", async () => {
    const withExif = await sharp(await image(400, 300)).withExif({ IFD0: { Make: "QA Phone" } }).toBuffer();
    expect((await sharp(withExif).metadata()).exif).toBeDefined();
    const out = await cleanPhoto(withExif);
    expect((await sharp(out!.buffer).metadata()).exif).toBeUndefined();
  });

  it("refuses a picture too large to decode safely", async () => {
    // 10,000 × 6,000 is 60 megapixels; PNG of one colour keeps the file small.
    const huge = await sharp({ create: { width: 10_000, height: 6_000, channels: 3, background: "white" } }).png().toBuffer();
    expect(await cleanPhoto(huge)).toBeNull();
  });

  it("refuses something that isn't an image", async () => {
    expect(await cleanPhoto(Buffer.from("not an image at all"))).toBeNull();
  });
});
