/**
 * strip-source.mjs — source with comments removed, for test assertions.
 *
 * WHY THIS IS SHARED RATHER THAN COPIED.
 *
 * Five times now in this codebase a source assertion has passed by matching the
 * COMMENT explaining a change rather than the code making it. Twice more it has
 * failed for the same reason in reverse — a comment that legitimately names the
 * thing being removed made a "did we remove it" check go red.
 *
 * The first version of this lived inside test-punch.mjs as two .replace() calls
 * and was wrong within the hour: components/PunchListPanel.tsx contains
 * accept="image/*", and a regex hunting for the next *\/ ate from inside that
 * string all the way through the next real comment, taking a hundred lines of
 * live code with it and failing three true assertions.
 *
 * So it is a scanner that knows what a string literal is, and it lives in one
 * file. Do not replace it with regexes, and do not copy it into a suite.
 */

/** Remove every comment from JS/TS/JSX source, leaving string literals intact. */
export function stripComments(src) {
  let out = "", i = 0, quote = null;
  while (i < src.length) {
    const c = src[i], next = src[i + 1];
    if (quote) {
      if (c === "\\") { out += src.slice(i, i + 2); i += 2; continue; }
      if (c === quote) quote = null;
      out += c; i++; continue;
    }
    if (c === '"' || c === "'" || c === "`") { quote = c; out += c; i++; continue; }
    if (c === "/" && next === "*") {
      const end = src.indexOf("*/", i + 2);
      i = end === -1 ? src.length : end + 2;
      continue;
    }
    if (c === "/" && next === "/") {
      const end = src.indexOf("\n", i);
      i = end === -1 ? src.length : end;
      continue;
    }
    out += c; i++;
  }
  return out;
}
