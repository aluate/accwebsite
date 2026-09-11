#!/usr/bin/env node
/**
 * test-file-store.mjs — the filesystem driver behaves like the Supabase one.
 *
 * No database, no network. Writes under a temp directory and removes it.
 *
 * WHY. Nineteen files talk to storage, and the sandbox has no route to
 * supabase.co, so every path that touches a file — drawing upload, the
 * engineering release packet, the contract packet, the signoff page, punch
 * photos, spec PDF auto-save — could only ever be tested by hand on the live
 * site. A second driver only helps if it answers the same way the first one
 * does, so these assertions hold it to the Supabase contract: the same method
 * names, the same `{ data, error }` shape, a Blob out of download(), an empty
 * list rather than an error for a folder with nothing in it, and a refusal when
 * upsert is false and the object is already there.
 *
 * The last group is the one that matters beyond convenience: a signed URL must
 * not become a way to read the disk. A path climbing out of the root is
 * refused, and a signature that has expired or been edited does not verify.
 */
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = mkdtempSync(join(tmpdir(), "acc-files-"));
process.env.FILE_STORAGE_DRIVER = "fs";
process.env.LOCAL_FILE_ROOT = root;
process.env.SESSION_SECRET = "test-secret-for-signing-only";
process.env.LOCAL_FILE_BASE_URL = "http://127.0.0.1:3000";

const {
  fileStore, storageDriver, isLocalStorage, localRoot,
  signLocalPath, verifyLocalSignature, BUCKET,
} = await import("../lib/file-store.ts");

let pass = 0, fail = 0;
const check = (name, cond, detail = "") => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? "  -> " + detail : ""}`); }
};

const store = fileStore();
const KEY = "ACC-2026-0999/drawings/plans.pdf";
const BODY = Buffer.from("%PDF-1.4 not really a pdf, but bytes are bytes\n");

console.log("\nwhich driver is in play\n");
check("driver is fs when the env var says so", storageDriver() === "fs");
check("isLocalStorage agrees", isLocalStorage() === true);
check("root is the temp directory", localRoot() === root, localRoot());
check("the bucket name has not drifted", BUCKET === "job-files", BUCKET);

console.log("\nupload, download, list, remove\n");
{
  const up = await store.upload(KEY, BODY, { contentType: "application/pdf" });
  check("upload reports no error", up.error === null, JSON.stringify(up.error));
  check("upload echoes the path back", up.data?.path === KEY);
  check("the bytes are on disk", existsSync(join(root, KEY)));
  check("the bytes are the bytes", readFileSync(join(root, KEY)).equals(BODY));

  const down = await store.download(KEY);
  check("download reports no error", down.error === null);
  check("download hands back a Blob", down.data instanceof Blob);
  const round = Buffer.from(new Uint8Array(await down.data.arrayBuffer()));
  check("the round trip is byte-for-byte", round.equals(BODY));
  check("the content type survived", down.data.type === "application/pdf", down.data?.type);

  const missing = await store.download("ACC-2026-0999/drawings/nope.pdf");
  check("a missing object is an error, not a throw", missing.error !== null && missing.data === null);

  const listed = await store.list("ACC-2026-0999/drawings");
  check("list finds the file", (listed.data ?? []).some((f) => f.name === "plans.pdf"));
  check("list hides the content-type sidecar", !(listed.data ?? []).some((f) => f.name.endsWith(".contenttype")));

  const searched = await store.list("ACC-2026-0999/drawings", { search: "plans" });
  check("list honours search", (searched.data ?? []).length === 1);
  const searchedMiss = await store.list("ACC-2026-0999/drawings", { search: "zzz" });
  check("search that matches nothing is an empty list", (searchedMiss.data ?? []).length === 0);

  const emptyFolder = await store.list("ACC-2026-0999/nothing-here");
  check("an empty folder is [] and not an error", emptyFolder.error === null && (emptyFolder.data ?? []).length === 0);
}

console.log("\nupsert, the way Supabase does it\n");
{
  const second = await store.upload(KEY, Buffer.from("different"), { contentType: "application/pdf" });
  check("a second upload without upsert is refused", second.error !== null);
  check("and the original bytes are untouched", readFileSync(join(root, KEY)).equals(BODY));

  const forced = await store.upload(KEY, Buffer.from("replaced"), { contentType: "application/pdf", upsert: true });
  check("upsert:true replaces it", forced.error === null);
  check("with the new bytes", readFileSync(join(root, KEY)).toString() === "replaced");

  await store.upload(KEY, BODY, { contentType: "application/pdf", upsert: true });
}

console.log("\nbody types a call site might hand us\n");
{
  const cases = [
    ["Buffer", Buffer.from("buffer bytes")],
    ["Uint8Array", new Uint8Array([104, 105])],
    ["ArrayBuffer", new Uint8Array([1, 2, 3]).buffer],
    ["Blob", new Blob([Buffer.from("blob bytes")])],
    ["string", "just a string"],
  ];
  for (const [label, body] of cases) {
    const k = `bodies/${label}.bin`;
    const r = await store.upload(k, body, { upsert: true });
    check(`${label} uploads`, r.error === null, JSON.stringify(r.error));
    check(`${label} is readable afterwards`, existsSync(join(root, k)));
  }
}

console.log("\nsigned URLs\n");
{
  const signed = await store.createSignedUrl(KEY, 3600);
  check("signing an existing object works", signed.error === null);
  const url = new URL(signed.data.signedUrl);
  check("the URL points at the dev-files route", url.pathname.startsWith("/api/dev-files/"), url.pathname);
  check("it carries an expiry", Number(url.searchParams.get("expires")) > Date.now());
  check("it carries a signature", (url.searchParams.get("sig") ?? "").length === 32);

  const expires = Number(url.searchParams.get("expires"));
  const sig = url.searchParams.get("sig");
  check("the signature verifies", verifyLocalSignature(KEY, expires, sig));
  check("a tampered path does not verify", !verifyLocalSignature("other/file.pdf", expires, sig));
  check("a tampered expiry does not verify", !verifyLocalSignature(KEY, expires + 1000, sig));
  check("an edited signature does not verify", !verifyLocalSignature(KEY, expires, sig.replace(/.$/, "0") === sig ? "1".repeat(32) : sig.replace(/.$/, "0")));
  check("an expired link does not verify", !verifyLocalSignature(KEY, Date.now() - 1, signLocalPath(KEY, Date.now() - 1)));
  check("an empty signature does not verify", !verifyLocalSignature(KEY, expires, ""));

  const missing = await store.createSignedUrl("no/such/file.pdf", 60);
  check("signing something that is not there is an error", missing.error !== null);

  const upload = await store.createSignedUploadUrl("ACC-2026-0999/drawings/big.pdf");
  check("a signed upload URL is issued for an object that does not exist yet", upload.error === null);
  check("and it names the path it is for", upload.data?.path === "ACC-2026-0999/drawings/big.pdf");
}

console.log("\npaths that try to leave the root\n");
{
  for (const bad of ["../escaped.txt", "ACC-2026-0999/../../escaped.txt", "/etc/passwd"]) {
    const r = await store.upload(bad, Buffer.from("nope"), { upsert: true });
    const escaped = existsSync(join(root, "..", "escaped.txt"));
    check(`refused or contained: ${bad}`, r.error !== null || !escaped, JSON.stringify(r.error));
  }
  check("nothing was written above the root", !existsSync(join(root, "..", "escaped.txt")));
}

console.log("\nremove\n");
{
  const r = await store.remove([KEY]);
  check("remove reports no error", r.error === null);
  check("the file is gone", !existsSync(join(root, KEY)));
  check("so is its content-type sidecar", !existsSync(join(root, `${KEY}.contenttype`)));
  const again = await store.remove([KEY]);
  check("removing it twice is not an error", again.error === null);
}

rmSync(root, { recursive: true, force: true });

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
