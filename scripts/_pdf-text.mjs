/**
 * scripts/_pdf-text.mjs — read the words back out of a rendered PDF.
 *
 * WHY THIS EXISTS. Every PDF assertion in this repo up to now has been structural:
 * page counts, and a count of embedded image objects. Those catch a whole class of
 * bug (work orders leaking into the client's signature packet, a swatch that never
 * embeds) and are blind to the far more common one: the sheet prints, it looks right,
 * and it says the wrong thing. "Every work order printed HARDROCK MAPLE regardless
 * of what the boxes are made of" rendered perfectly for months.
 *
 * @react-pdf writes text into Flate-compressed content streams as hex-encoded
 * strings inside TJ/Tj operators — `[<44> -166 <52> ...] TJ` is "DR...". The codes
 * are the font's, but @react-pdf's subsets are built with the character code as the
 * glyph code for the Latin range, so hex-decoding gives back ASCII. That is an
 * implementation detail of the renderer, not a guarantee, so `assertDecodable()`
 * exists: it checks a string the caller KNOWS is on the page, and fails loudly if
 * decoding has stopped working rather than letting every text assertion below it
 * quietly pass on an empty string.
 *
 * Not a general PDF text extractor. No word or line spacing is reconstructed, so
 * search for short literals ("PF MAPLE"), not for sentences or layout.
 */
import { PDFDocument, PDFRawStream, PDFName } from "pdf-lib";
import zlib from "node:zlib";

/** All decoded text on the page, in stream order. Whitespace is NOT reconstructed. */
export async function pdfText(buf) {
  const doc = await PDFDocument.load(buf);
  let out = "";
  for (const [, obj] of doc.context.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFRawStream)) continue;
    let bytes = obj.getContents();
    if (String(obj.dict.get(PDFName.of("Filter"))) === "/FlateDecode") {
      try { bytes = zlib.inflateSync(Buffer.from(bytes)); } catch { continue; }
    }
    const s = Buffer.from(bytes).toString("latin1");
    if (!s.includes("TJ") && !s.includes("Tj")) continue;   // not a text stream
    // Hex strings only. @react-pdf never emits literal ( ) strings, and treating a
    // path operator's operands as text would produce convincing garbage.
    for (const m of s.matchAll(/<([0-9A-Fa-f]+)>/g)) {
      const hex = m[1].length % 2 ? m[1] + "0" : m[1];
      out += Buffer.from(hex, "hex").toString("latin1");
    }
  }
  return out;
}

/** Text with runs of non-alphanumerics collapsed, for matching across kerning gaps. */
export function squash(s) {
  return s.replace(/[^A-Za-z0-9#"/.&-]+/g, " ").replace(/\s+/g, " ").toUpperCase();
}

/**
 * Fail loudly if hex-decoding has stopped yielding ASCII. `known` must be something
 * the caller is certain is on the page — otherwise a renderer change turns every
 * text assertion into a silent pass.
 */
export function assertDecodable(text, known, label = "pdf text extraction") {
  if (squash(text).includes(squash(known))) return;
  throw new Error(
    `${label}: could not find ${JSON.stringify(known)} in ${text.length} decoded chars. ` +
    `@react-pdf's glyph encoding has probably changed, so no text assertion below here means anything. ` +
    `Fix scripts/_pdf-text.mjs before trusting any result.`,
  );
}
