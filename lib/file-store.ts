/**
 * lib/file-store.ts — where uploaded files live, behind one door.
 *
 * WHY THIS FILE EXISTS.
 *
 * Nineteen files each built their own Supabase client and called
 * `.storage.from("job-files")` on it. That is fine in production, where Supabase
 * is reachable and the service role key is set, and it is a wall everywhere else:
 * a sandbox with no route to supabase.co cannot upload a drawing, so it cannot
 * test the drawing upload, the engineering release packet (which refuses to send
 * without an attachment), the contract packet, the signoff page, punch photos, or
 * the spec PDF auto-save. Those are exactly the paths worth testing unattended,
 * and they were the ones that could only be tested by hand on the live site.
 *
 * So: one interface, two drivers. The shape deliberately mirrors the Supabase
 * storage client — same method names, same `{ data, error }` returns — so the
 * call sites change by one line (`supabaseAdmin().storage.from(BUCKET)` becomes
 * `fileStore()`) rather than being rewritten around a new API.
 *
 * Supabase stays the default. The filesystem driver only appears when
 * FILE_STORAGE_DRIVER=fs is set, which nothing in production sets, so the
 * production path is the path that was already there.
 */

import { createHmac, timingSafeEqual } from "crypto";
import { promises as fs } from "fs";
import { dirname, join, normalize, resolve, sep } from "path";

/** The one bucket this app has ever used. */
export const BUCKET = "job-files";

export type StoreError = { message: string };
export type Result<T> = { data: T | null; error: StoreError | null };

export type UploadBody = Buffer | Uint8Array | ArrayBuffer | Blob | string;
export type UploadOptions = { contentType?: string; upsert?: boolean };

export interface FileStore {
  upload(path: string, body: UploadBody, options?: UploadOptions): Promise<Result<{ path: string }>>;
  download(path: string): Promise<Result<Blob>>;
  createSignedUrl(path: string, expiresIn: number): Promise<Result<{ signedUrl: string }>>;
  createSignedUploadUrl(path: string): Promise<Result<{ signedUrl: string; token: string; path: string }>>;
  list(folder: string, options?: { search?: string }): Promise<Result<Array<{ name: string }>>>;
  remove(paths: string[]): Promise<Result<unknown>>;
}

/* ────────────────────────── driver selection ────────────────────────── */

export type DriverName = "supabase" | "fs";

export function storageDriver(): DriverName {
  return process.env.FILE_STORAGE_DRIVER === "fs" ? "fs" : "supabase";
}

/** True when files are on local disk — the dev-files route checks this. */
export function isLocalStorage(): boolean {
  return storageDriver() === "fs";
}

let cached: { driver: DriverName; store: FileStore } | null = null;

/**
 * The file store, whichever one this environment has.
 *
 * Call it where you used to write `supabaseAdmin().storage.from(BUCKET)`.
 */
export function fileStore(): FileStore {
  const driver = storageDriver();
  if (cached && cached.driver === driver) return cached.store;
  const store = driver === "fs" ? fsStore() : supabaseStore();
  cached = { driver, store };
  return store;
}

/** Tests swap drivers inside one process; production never calls this. */
export function _resetFileStoreForTests(): void {
  cached = null;
}

/**
 * A stand-in for the Supabase client, for the call sites that already read
 * `supabaseAdmin().storage.from(BUCKET)`.
 *
 * Every Supabase client in this app existed only to reach storage — none of
 * them query, authenticate or call a function — so a factory returning this is
 * a complete replacement, and the eighteen files that build one changed by a
 * single line each instead of having every call rewritten. The bucket argument
 * is accepted and ignored: there is one bucket, and `BUCKET` above is it.
 */
export function storageClient(): { storage: { from: (bucket?: string) => FileStore } } {
  return { storage: { from: (_bucket?: string) => fileStore() } };
}

/* ────────────────────────── supabase driver ─────────────────────────── */

function supabaseStore(): FileStore {
  // Imported lazily so a filesystem-only environment does not need the package
  // resolved, and so a missing key is an error at first use rather than import.
  const load = async () => {
    const { createClient } = await import("@supabase/supabase-js");
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error("Supabase storage is not configured (URL or service role key missing)");
    return createClient(url, key).storage.from(BUCKET);
  };

  return {
    async upload(path, body, options) {
      const b = await load();
      return (await b.upload(path, body as Blob, options)) as Result<{ path: string }>;
    },
    async download(path) {
      const b = await load();
      return (await b.download(path)) as Result<Blob>;
    },
    async createSignedUrl(path, expiresIn) {
      const b = await load();
      return (await b.createSignedUrl(path, expiresIn)) as Result<{ signedUrl: string }>;
    },
    async createSignedUploadUrl(path) {
      const b = await load();
      return (await b.createSignedUploadUrl(path)) as Result<{ signedUrl: string; token: string; path: string }>;
    },
    async list(folder, options) {
      const b = await load();
      return (await b.list(folder, options)) as Result<Array<{ name: string }>>;
    },
    async remove(paths) {
      const b = await load();
      return (await b.remove(paths)) as Result<unknown>;
    },
  };
}

/* ──────────────────────────── fs driver ─────────────────────────────── */

/** Where the filesystem driver keeps its files. Outside the repo by default. */
export function localRoot(): string {
  return resolve(process.env.LOCAL_FILE_ROOT || ".data/job-files");
}

/**
 * Object keys come from job ids and filenames that a person typed. Resolve the
 * key against the root and refuse anything that lands outside it, so a filename
 * carrying `../` cannot write into the repo.
 */
function safeJoin(root: string, key: string): string {
  const full = resolve(join(root, normalize(key)));
  if (full !== root && !full.startsWith(root + sep)) {
    throw new Error(`Refusing a storage path outside the root: ${key}`);
  }
  return full;
}

async function toBuffer(body: UploadBody): Promise<Buffer> {
  if (Buffer.isBuffer(body)) return body;
  if (typeof body === "string") return Buffer.from(body, "utf8");
  if (body instanceof ArrayBuffer) return Buffer.from(new Uint8Array(body));
  if (ArrayBuffer.isView(body)) return Buffer.from(body.buffer, body.byteOffset, body.byteLength);
  if (typeof (body as Blob)?.arrayBuffer === "function") {
    return Buffer.from(new Uint8Array(await (body as Blob).arrayBuffer()));
  }
  throw new Error("Unsupported upload body");
}

const ok = <T>(data: T): Result<T> => ({ data, error: null });
const fail = <T>(message: string): Result<T> => ({ data: null, error: { message } });

/**
 * Signatures on local URLs.
 *
 * The local driver hands out URLs that a browser, the PDF merger and an email
 * attachment fetch all have to be able to open, so they are real HTTP URLs
 * served by /api/dev-files. Signing them keeps that route from becoming a way
 * to read any path on disk: the route only serves what this function signed,
 * and only until it expires.
 */
function signingKey(): string {
  return process.env.SESSION_SECRET || "dev-file-store-key";
}

export function signLocalPath(path: string, expiresAtMs: number): string {
  return createHmac("sha256", signingKey()).update(`${path}\n${expiresAtMs}`).digest("hex").slice(0, 32);
}

export function verifyLocalSignature(path: string, expiresAtMs: number, signature: string): boolean {
  if (!Number.isFinite(expiresAtMs) || Date.now() > expiresAtMs) return false;
  const expected = Buffer.from(signLocalPath(path, expiresAtMs));
  const given = Buffer.from(signature || "");
  return expected.length === given.length && timingSafeEqual(expected, given);
}

function localBaseUrl(): string {
  return (
    process.env.LOCAL_FILE_BASE_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.BASE_URL ||
    "http://127.0.0.1:3000"
  ).replace(/\/+$/, "");
}

function localUrl(path: string, expiresInSeconds: number): string {
  const expires = Date.now() + Math.max(1, expiresInSeconds) * 1000;
  const sig = signLocalPath(path, expires);
  return `${localBaseUrl()}/api/dev-files/${path.split("/").map(encodeURIComponent).join("/")}?expires=${expires}&sig=${sig}`;
}

function fsStore(): FileStore {
  const root = localRoot();

  return {
    async upload(path, body, options) {
      try {
        const full = safeJoin(root, path);
        if (!options?.upsert) {
          const exists = await fs.stat(full).then(() => true, () => false);
          if (exists) return fail("The resource already exists");
        }
        await fs.mkdir(dirname(full), { recursive: true });
        await fs.writeFile(full, await toBuffer(body));
        if (options?.contentType) {
          await fs.writeFile(`${full}.contenttype`, options.contentType, "utf8").catch(() => {});
        }
        return ok({ path });
      } catch (e) {
        return fail((e as Error).message);
      }
    },

    async download(path) {
      try {
        const full = safeJoin(root, path);
        const buf = await fs.readFile(full);
        const type = await fs.readFile(`${full}.contenttype`, "utf8").catch(() => "application/octet-stream");
        // Copy into a fresh ArrayBuffer so the Blob does not view the pooled one.
        const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
        return ok(new Blob([ab], { type }));
      } catch {
        return fail("Object not found");
      }
    },

    async createSignedUrl(path, expiresIn) {
      try {
        await fs.stat(safeJoin(root, path));
      } catch {
        return fail("Object not found");
      }
      return ok({ signedUrl: localUrl(path, expiresIn) });
    },

    async createSignedUploadUrl(path) {
      try {
        safeJoin(root, path);
      } catch (e) {
        return fail((e as Error).message);
      }
      const url = localUrl(path, 60 * 60);
      return ok({ signedUrl: url, token: new URL(url).searchParams.get("sig") ?? "", path });
    },

    async list(folder, options) {
      try {
        const full = safeJoin(root, folder);
        const names = await fs.readdir(full);
        const visible = names.filter((n) => !n.endsWith(".contenttype"));
        const search = options?.search;
        return ok((search ? visible.filter((n) => n.includes(search)) : visible).map((name) => ({ name })));
      } catch {
        return ok([]); // Supabase returns an empty list for a folder with nothing in it.
      }
    },

    async remove(paths) {
      try {
        for (const p of paths) {
          const full = safeJoin(root, p);
          await fs.unlink(full).catch(() => {});
          await fs.unlink(`${full}.contenttype`).catch(() => {});
        }
        return ok({});
      } catch (e) {
        return fail((e as Error).message);
      }
    },
  };
}
