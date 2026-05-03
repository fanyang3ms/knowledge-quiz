// Repair batches: escape stray double-quotes inside string values.
// Strategy: scan char-by-char; outside a string, " opens a string. Inside a string,
// when we hit a " we look ahead to decide if it's a real terminator (followed by
// optional whitespace then one of , ] } : ) or a stray quote (anything else).
const fs = require("fs");
const path = require("path");

function repair(text) {
  const out = [];
  let i = 0;
  let inString = false;
  while (i < text.length) {
    const ch = text[i];
    if (!inString) {
      if (ch === '"') { inString = true; out.push(ch); i++; continue; }
      out.push(ch); i++; continue;
    }
    // inside a string
    if (ch === "\\") {
      // copy escape sequence as-is
      out.push(ch);
      if (i + 1 < text.length) { out.push(text[i+1]); i += 2; }
      else { i++; }
      continue;
    }
    if (ch === '"') {
      // look ahead past whitespace
      let j = i + 1;
      while (j < text.length && /\s/.test(text[j])) j++;
      const next = text[j];
      // structural terminator?
      if (next === "," || next === "}" || next === "]" || next === ":") {
        // real string end
        out.push('"');
        inString = false;
        i++;
        continue;
      } else {
        // stray inner quote — escape it
        out.push('\\"');
        i++;
        continue;
      }
    }
    out.push(ch); i++;
  }
  return out.join("");
}

const files = ["batch1.json", "batch3.json", "batch4.json"];
for (const f of files) {
  const p = path.join(__dirname, f);
  const orig = fs.readFileSync(p, "utf8");
  const fixed = repair(orig);
  try {
    JSON.parse(fixed);
    fs.writeFileSync(p, fixed, "utf8");
    console.log(f, "fixed and valid");
  } catch (e) {
    console.error(f, "still broken:", e.message);
  }
}
