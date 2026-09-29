// Supabase Storage, over plain fetch. No SDK to install and no bytes held in
// memory any longer than one request: the upload goes to Supabase, and only the
// resulting object URL is stored in Postgres.
//
// Config lives in the environment:
//   SUPABASE_URL          https://<project-ref>.supabase.co
//   SUPABASE_SERVICE_KEY  the secret key (service role) — server only
//   SUPABASE_BUCKET       optional, defaults to "chat-uploads"

const projectUrl = process.env.SUPABASE_URL?.trim().replace(/\/+$/, "") ?? "";
const secret = (
  process.env.SUPABASE_SERVICE_KEY ??
  process.env.SUPABASE_SECRET_KEY ??
  process.env.SUPABASE_KEY
)?.trim();

export const BUCKET = process.env.SUPABASE_BUCKET?.trim() || "chat-uploads";

/** True when both halves of the Storage config are present. */
export const storageEnabled = Boolean(projectUrl && secret);

const authHeaders = (extra: Record<string, string> = {}): Record<string, string> => {
  const token = secret ?? "";
  return { apikey: token, Authorization: "Bearer " + token, ...extra };
};

const objectPath = (path: string) => path.replace(/^\/+/, "");

/** The permanent, CDN-cached URL for an object. The bucket is public. */
export const publicUrl = (path: string): string =>
  projectUrl + "/storage/v1/object/public/" + BUCKET + "/" + objectPath(path);

/** Reverse of `publicUrl` — used to clean up an object we no longer reference. */
export function pathFromUrl(url: string): string | null {
  const marker = "/storage/v1/object/public/" + BUCKET + "/";
  const at = url.indexOf(marker);
  return at === -1 ? null : decodeURIComponent(url.slice(at + marker.length));
}

let bucketPromise: Promise<void> | null = null;

/**
 * Make sure the bucket exists and is public, once per server process. Being
 * public matters: the browser then fetches pictures straight from Supabase's
 * CDN instead of streaming them through this app on every render.
 */
export function ensureBucket(): Promise<void> {
  if (!storageEnabled) return Promise.resolve();
  if (!bucketPromise) {
    bucketPromise = (async () => {
      const res = await fetch(projectUrl + "/storage/v1/bucket", {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ id: BUCKET, name: BUCKET, public: true }),
      });
      // 400/409 simply means somebody (or an earlier boot) already made it.
      if (!res.ok && res.status !== 400 && res.status !== 409) {
        const detail = await res.text().catch(() => "");
        throw new Error("Could not reach Supabase Storage (" + res.status + " " + detail + ")");
      }
    })().catch((err) => {
      bucketPromise = null;
      throw err;
    });
  }
  return bucketPromise;
}

export async function uploadObject(
  path: string,
  contentType: string,
  bytes: Buffer
): Promise<void> {
  await ensureBucket();
  const res = await fetch(
    projectUrl + "/storage/v1/object/" + BUCKET + "/" + objectPath(path),
    {
      method: "POST",
      headers: authHeaders({
        "Content-Type": contentType || "application/octet-stream",
        // Objects are content-addressed and never rewritten, so they can sit in
        // the CDN for a year.
        "Cache-Control": "max-age=31536000",
        "x-upsert": "true",
      }),
      body: new Uint8Array(bytes),
    }
  );
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error("Upload to storage failed (" + res.status + " " + detail + ")");
  }
}

/** Best-effort cleanup — a missing object is not an error. */
export async function deleteObject(path: string): Promise<void> {
  if (!storageEnabled) return;
  try {
    await fetch(projectUrl + "/storage/v1/object/" + BUCKET + "/" + objectPath(path), {
      method: "DELETE",
      headers: authHeaders(),
    });
  } catch {
    /* nothing to do — the row is gone either way */
  }
}
