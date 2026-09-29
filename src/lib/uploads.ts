import { randomUUID } from "node:crypto";
import { deleteObject, pathFromUrl, publicUrl, storageEnabled, uploadObject } from "./storage";
import { store } from "./store";
import type { Attachment } from "./types";

// One upload path for every picture and file the app accepts. When Supabase
// Storage is configured the bytes go there and Postgres only keeps the URL;
// otherwise they fall back to the database (or memory) exactly like before.

export type UploadOutcome =
  | { ok: true; attachment: Attachment }
  | { ok: false; status: number; error: string };

const EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/avif": "avif",
  "application/pdf": "pdf",
  "text/plain": "txt",
  "application/zip": "zip",
};

function extensionFor(filename: string, contentType: string): string {
  const match = /\.([a-z0-9]{1,8})$/i.exec(filename);
  return match ? match[1].toLowerCase() : EXTENSIONS[contentType] ?? "bin";
}

export const safeFilename = (name: string): string =>
  name.replace(/[\r\n"\\]/g, "_").slice(0, 120) || "file";

export const megabytes = (bytes: number): number => Math.round(bytes / 1_000_000);

export async function acceptUpload(opts: {
  uploaderId: number;
  file: File;
  limitBytes: number;
  /** folder inside the bucket, e.g. "images" or "avatars" */
  folder: string;
}): Promise<UploadOutcome> {
  const { uploaderId, file, limitBytes, folder } = opts;
  const contentType = (file.type || "application/octet-stream").toLowerCase();
  const filename = safeFilename(file.name || "file");

  if (file.size <= 0) return { ok: false, status: 400, error: "That file is empty" };
  if (file.size > limitBytes) {
    return {
      ok: false,
      status: 413,
      error: "Files must be under " + megabytes(limitBytes) + " MB",
    };
  }

  let bytes: Buffer | null = null;
  let remoteUrl: string | null = null;

  try {
    if (storageEnabled) {
      const path =
        folder + "/" + uploaderId + "-" + randomUUID() + "." + extensionFor(filename, contentType);
      await uploadObject(path, contentType, Buffer.from(await file.arrayBuffer()));
      remoteUrl = publicUrl(path);
    } else {
      bytes = Buffer.from(await file.arrayBuffer());
    }
  } catch (err) {
    console.error("storage upload failed", err);
    return { ok: false, status: 502, error: "Image storage is not reachable right now" };
  }

  const attachment = await store.createAttachment(
    uploaderId,
    filename,
    contentType,
    file.size,
    bytes,
    remoteUrl
  );
  return { ok: true, attachment };
}

/** Drop the stored object behind an attachment we are about to forget. */
export async function discardStoredFile(remoteUrl: string | null): Promise<void> {
  if (!remoteUrl) return;
  const path = pathFromUrl(remoteUrl);
  if (path) await deleteObject(path);
}
