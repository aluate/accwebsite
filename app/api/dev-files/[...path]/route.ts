/**
 * /api/dev-files/[...path] — what a signed URL points at when files are on disk.
 *
 * Only exists for the filesystem storage driver (FILE_STORAGE_DRIVER=fs). In
 * production the driver is Supabase, this route answers 404 to everything, and
 * nothing links to it.
 *
 * A signed URL from the local driver is a real HTTP URL because the things that
 * consume one — a browser tab, the PDF merger, an email attachment fetch — all
 * speak HTTP and none of them can read the sandbox's disk. The signature is what
 * stops the route from being a way to read arbitrary paths: it serves only what
 * lib/file-store.ts signed, only until that signature expires, and only from
 * inside the storage root.
 */

import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import { dirname, join, normalize, resolve, sep } from "path";
import { isLocalStorage, localRoot, verifyLocalSignature } from "@/lib/file-store";

export const runtime = "nodejs";

const off = () => NextResponse.json({ error: "Not found" }, { status: 404 });

function resolveSafe(key: string): string | null {
  const root = localRoot();
  const full = resolve(join(root, normalize(key)));
  if (full !== root && !full.startsWith(root + sep)) return null;
  return full;
}

function check(req: NextRequest, key: string): NextResponse | null {
  const expires = Number(req.nextUrl.searchParams.get("expires"));
  const sig = req.nextUrl.searchParams.get("sig") ?? "";
  if (!verifyLocalSignature(key, expires, sig)) {
    return NextResponse.json({ error: "Link expired or not signed" }, { status: 403 });
  }
  return null;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  if (!isLocalStorage()) return off();
  const { path } = await params;
  const key = path.map(decodeURIComponent).join("/");

  const bad = check(req, key);
  if (bad) return bad;

  const full = resolveSafe(key);
  if (!full) return off();

  try {
    const buf = await fs.readFile(full);
    const type = await fs.readFile(`${full}.contenttype`, "utf8").catch(() => "application/octet-stream");
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": type,
        "Content-Length": String(buf.byteLength),
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return off();
  }
}

/** The direct-upload path (files over 4MB) PUTs to the URL it was handed. */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  if (!isLocalStorage()) return off();
  const { path } = await params;
  const key = path.map(decodeURIComponent).join("/");

  const bad = check(req, key);
  if (bad) return bad;

  const full = resolveSafe(key);
  if (!full) return off();

  const body = Buffer.from(new Uint8Array(await req.arrayBuffer()));
  await fs.mkdir(dirname(full), { recursive: true });
  await fs.writeFile(full, body);
  const type = req.headers.get("content-type");
  if (type) await fs.writeFile(`${full}.contenttype`, type, "utf8").catch(() => {});

  return NextResponse.json({ Key: key });
}
