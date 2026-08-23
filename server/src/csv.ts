// Minimal RFC4180-ish CSV read/write helpers (no external dependency).
// Handles quoting, embedded delimiters, quotes and newlines.
//
// Delimiter is ";" (not ","), matching the convention used by Excel in locales
// where "," is the decimal separator — makes the exported files open cleanly there.
// New files are always written with ";"; existing "," files from before this change
// are still auto-detected on read so old data keeps working (and gets upgraded to
// ";" the next time that file is saved).
const DELIMITER = ";";
const LEGACY_DELIMITER = ",";

/** Our header rows are fixed ascii field names, so a literal ";" in the first
 *  line only ever appears when the file was already written with ";". */
function detectDelimiter(text: string): string {
  const firstLine = text.slice(0, text.search(/\r?\n/) === -1 ? text.length : text.search(/\r?\n/));
  return firstLine.includes(DELIMITER) ? DELIMITER : LEGACY_DELIMITER;
}

export function parseCSV(rawText: string): string[][] {
  // Strip a leading UTF-8 BOM if present — Excel writes one, and our own /export
  // endpoint adds one to the downloaded copy so it round-trips cleanly on re-import.
  const text = rawText.charCodeAt(0) === 0xfeff ? rawText.slice(1) : rawText;
  const delimiter = detectDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  const len = text.length;

  const pushField = () => {
    row.push(field);
    field = "";
  };
  const pushRow = () => {
    pushField();
    rows.push(row);
    row = [];
  };

  while (i < len) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (ch === delimiter) {
      pushField();
      i++;
      continue;
    }
    if (ch === "\r") {
      i++;
      continue;
    }
    if (ch === "\n") {
      pushRow();
      i++;
      continue;
    }
    field += ch;
    i++;
  }
  // last field/row (avoid trailing empty row if file ends with newline)
  if (field.length > 0 || row.length > 0) {
    pushRow();
  }
  return rows.filter((r) => !(r.length === 1 && r[0] === ""));
}

function escapeField(value: unknown): string {
  const str = value === null || value === undefined ? "" : String(value);
  if (str.includes(DELIMITER) || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function stringifyCSV(headers: string[], rows: Record<string, unknown>[]): string {
  const lines = [headers.map(escapeField).join(DELIMITER)];
  for (const row of rows) {
    lines.push(headers.map((h) => escapeField(row[h])).join(DELIMITER));
  }
  return lines.join("\r\n") + "\r\n";
}

export function rowsToObjects(rows: string[][]): Record<string, string>[] {
  if (rows.length === 0) return [];
  const [header, ...rest] = rows;
  return rest.map((r) => {
    const obj: Record<string, string> = {};
    header.forEach((key, idx) => {
      obj[key] = r[idx] ?? "";
    });
    return obj;
  });
}
