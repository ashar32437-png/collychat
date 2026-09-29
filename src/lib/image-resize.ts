// Browser-only helpers that shrink an image before it is uploaded. Phones
// happily produce 8 MB photos, and a 30-person chat with 500 MB of storage
// cannot keep those around — so everything that comes out of here is a WebP
// capped at `maxEdge` pixels, usually 10-20x smaller than the original.
//
// Animated GIFs and SVGs are passed straight through: re-encoding them through
// a canvas would flatten the animation or lose vector sharpness.

const RESIZABLE = /^image\/(jpeg|png|webp|avif|bmp)$/i;

export function canShrink(file: File): boolean {
  return RESIZABLE.test(file.type);
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("That image could not be read"));
    };
    image.src = url;
  });
}

const webpName = (name: string) => name.replace(/\.[^.]+$/, "") + ".webp";

/**
 * Downscale + re-encode a picture. Returns the original file whenever the
 * result would not actually be smaller (or the browser gives us nothing).
 */
export async function shrinkImage(file: File, maxEdge: number, quality = 0.82): Promise<File> {
  if (!canShrink(file)) return file;
  try {
    const image = await loadImage(file);
    const width = image.naturalWidth || image.width;
    const height = image.naturalHeight || image.height;
    if (!width || !height) return file;

    const scale = Math.min(1, maxEdge / Math.max(width, height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));

    const context = canvas.getContext("2d");
    if (!context) return file;
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/webp", quality)
    );
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], webpName(file.name || "image"), { type: "image/webp" });
  } catch {
    return file;
  }
}
