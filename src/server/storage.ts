import "server-only";
import { createReadStream } from "node:fs";
import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";

/**
 * File storage for workshop photos/videos.
 * - Default: local folder `./storage` (perfect on the garage PC / a VPS).
 * - Set SUPABASE_STORAGE_BUCKET (+ NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
 *   to use a private Supabase Storage bucket instead (needed on Vercel).
 * Files are never public: they are streamed through /api/media/[id] after an access check.
 */

const ROOT = path.join(process.cwd(), "storage");

function supabase() {
  const bucket = process.env.SUPABASE_STORAGE_BUCKET;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return bucket && url && key ? { bucket, url: url.replace(/\/$/, ""), key } : null;
}

function localPath(key: string): string {
  const full = path.join(ROOT, key);
  if (!full.startsWith(ROOT + path.sep)) throw new Error("Invalid storage key");
  return full;
}

export async function putObject(key: string, body: Buffer, contentType: string): Promise<void> {
  const sb = supabase();
  if (sb) {
    const res = await fetch(`${sb.url}/storage/v1/object/${sb.bucket}/${key}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${sb.key}`, apikey: sb.key, "Content-Type": contentType, "x-upsert": "false" },
      body: new Uint8Array(body),
    });
    if (!res.ok) throw new Error(`Supabase Storage upload failed: ${res.status} ${await res.text()}`);
    return;
  }
  const file = localPath(key);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, body);
}

export async function deleteObject(key: string): Promise<void> {
  const sb = supabase();
  if (sb) {
    await fetch(`${sb.url}/storage/v1/object/${sb.bucket}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${sb.key}`, apikey: sb.key, "Content-Type": "application/json" },
      body: JSON.stringify({ prefixes: [key] }),
    });
  }
  // Also removes an older local copy (uploads made before Supabase was set up).
  await rm(localPath(key), { force: true });
}

/**
 * Streams an object, honouring HTTP Range requests — iOS Safari refuses to
 * play a video without them.
 */
export async function readObject(key: string, contentType: string, range: string | null): Promise<Response> {
  const baseHeaders = {
    "Content-Type": contentType,
    "Accept-Ranges": "bytes",
    // A stored file never changes (unique key, no overwrite): the browser may keep it
    // for a day instead of downloading the same photo again on every visit.
    // "private" = never kept by a shared cache (photos are not public).
    "Cache-Control": "private, max-age=86400, immutable",
    "X-Content-Type-Options": "nosniff",
    "Content-Disposition": "inline",
  };

  const sb = supabase();
  if (sb) {
    const upstream = await fetch(`${sb.url}/storage/v1/object/authenticated/${sb.bucket}/${key}`, {
      headers: { Authorization: `Bearer ${sb.key}`, apikey: sb.key, ...(range ? { Range: range } : {}) },
    });
    if (upstream.ok || upstream.status === 206) {
      const h = new Headers(baseHeaders);
      for (const name of ["Content-Length", "Content-Range"]) {
        const v = upstream.headers.get(name);
        if (v) h.set(name, v);
      }
      return new Response(upstream.body, { status: upstream.status, headers: h });
    }
    // Not in the bucket: files uploaded before Supabase was configured are
    // still in ./storage on this machine — serve them from there.
  }

  const file = localPath(key);
  let size: number;
  try {
    size = (await stat(file)).size;
  } catch {
    return new Response("Not found", { status: 404 });
  }

  const match = range ? /^bytes=(\d*)-(\d*)$/.exec(range) : null;
  if (match && (match[1] || match[2])) {
    let start = match[1] ? Number(match[1]) : size - Number(match[2]);
    let end = match[1] && match[2] ? Number(match[2]) : size - 1;
    start = Math.max(0, start);
    end = Math.min(end, size - 1);
    if (start > end) {
      return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    }
    const stream = Readable.toWeb(createReadStream(file, { start, end })) as ReadableStream;
    return new Response(stream, {
      status: 206,
      headers: { ...baseHeaders, "Content-Length": String(end - start + 1), "Content-Range": `bytes ${start}-${end}/${size}` },
    });
  }

  const stream = Readable.toWeb(createReadStream(file)) as ReadableStream;
  return new Response(stream, { status: 200, headers: { ...baseHeaders, "Content-Length": String(size) } });
}

/** Detects the real file type from its first bytes (never trust the browser's MIME type). */
export function sniffMedia(buf: Buffer): { kind: "PHOTO" | "VIDEO"; contentType: string; ext: string } | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { kind: "PHOTO", contentType: "image/jpeg", ext: "jpg" };
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { kind: "PHOTO", contentType: "image/png", ext: "png" };
  if (buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return { kind: "PHOTO", contentType: "image/webp", ext: "webp" };
  if (buf.toString("ascii", 4, 8) === "ftyp") {
    const brand = buf.toString("ascii", 8, 12);
    return brand === "qt  "
      ? { kind: "VIDEO", contentType: "video/quicktime", ext: "mov" }
      : { kind: "VIDEO", contentType: "video/mp4", ext: "mp4" };
  }
  if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) return { kind: "VIDEO", contentType: "video/webm", ext: "webm" };
  return null;
}

/** True when files go to Supabase Storage (then big files can be sent straight from the browser). */
export function directUploadAvailable(): boolean {
  return supabase() !== null;
}

/**
 * One-time signed URL letting the browser PUT one file straight into the private
 * bucket at `key` — the file never passes through our server (Vercel refuses
 * request bodies over 4.5 MB). The URL works once, for that key only, ~2 hours.
 */
export async function createSignedUpload(key: string): Promise<string> {
  const sb = supabase();
  if (!sb) throw new Error("Supabase Storage is not configured");
  const res = await fetch(`${sb.url}/storage/v1/object/upload/sign/${sb.bucket}/${key}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${sb.key}`, apikey: sb.key, "Content-Type": "application/json" },
    body: "{}",
  });
  if (!res.ok) throw new Error(`Supabase signed upload failed: ${res.status} ${await res.text()}`);
  const { url } = (await res.json()) as { url: string };
  return `${sb.url}/storage/v1${url}`;
}

/** First bytes and total size of a stored object (to check what was really uploaded). */
export async function readObjectHead(key: string, bytes = 32): Promise<{ head: Buffer; size: number } | null> {
  const sb = supabase();
  if (!sb) return null;
  const res = await fetch(`${sb.url}/storage/v1/object/authenticated/${sb.bucket}/${key}`, {
    headers: { Authorization: `Bearer ${sb.key}`, apikey: sb.key, Range: `bytes=0-${bytes - 1}` },
  });
  if (!res.ok && res.status !== 206) return null;
  const head = Buffer.from(await res.arrayBuffer()).subarray(0, bytes);
  const total = /\/(\d+)$/.exec(res.headers.get("content-range") ?? "")?.[1];
  const size = total ? Number(total) : Number(res.headers.get("content-length") ?? head.length);
  return { head, size };
}

export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
