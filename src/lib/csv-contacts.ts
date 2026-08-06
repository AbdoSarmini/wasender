import Papa from "papaparse";

export type ParsedContactRow = {
  name: string;
  phone: string;
  fields: string | null;
};

export type ParseContactsCsvResult = {
  rows: ParsedContactRow[];
  skipped: number;
  errors: string[];
};

export function normalizePhone(raw: string) {
  return String(raw).replace(/[^\d+]/g, "").replace(/^\+/, "");
}

function findKey(row: Record<string, string>, patterns: RegExp[]) {
  return Object.keys(row).find((k) => patterns.some((p) => p.test(k.trim())));
}

export function parseContactsCsv(text: string): ParseContactsCsvResult {
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });

  if (parsed.errors?.length) {
    const fatal = parsed.errors.find((e) => e.type !== "FieldMismatch");
    if (fatal) {
      throw new Error(`CSV parse error: ${fatal.message}`);
    }
  }

  const rawRows = parsed.data.filter((r) => Object.values(r).some((v) => v && v.trim()));
  if (rawRows.length === 0) {
    throw new Error("No rows found in CSV");
  }

  const phoneKey = findKey(rawRows[0], [/^phone$/i, /mobile/i, /number/i, /whats.?app/i]);
  const nameKey = findKey(rawRows[0], [/^name$/i, /full.?name/i, /contact/i]);

  if (!phoneKey) {
    throw new Error("Could not find a phone/mobile/number column in the CSV");
  }

  const rows: ParsedContactRow[] = [];
  let skipped = 0;
  const errors: string[] = [];
  const seenPhones = new Set<string>();

  for (const row of rawRows) {
    const phoneRaw = row[phoneKey];
    if (!phoneRaw) {
      skipped++;
      continue;
    }
    const phone = normalizePhone(phoneRaw);
    if (phone.length < 6) {
      skipped++;
      errors.push(`Invalid phone: ${phoneRaw}`);
      continue;
    }
    if (seenPhones.has(phone)) {
      skipped++;
      errors.push(`Duplicate phone: ${phoneRaw}`);
      continue;
    }
    seenPhones.add(phone);

    const name = (nameKey ? row[nameKey] : "")?.trim() || phone;

    const extra: Record<string, string> = {};
    for (const key of Object.keys(row)) {
      if (key === phoneKey || key === nameKey) continue;
      if (row[key]) extra[key] = row[key];
    }
    const fields = Object.keys(extra).length ? JSON.stringify(extra) : null;

    rows.push({ name, phone, fields });
  }

  return { rows, skipped, errors: errors.slice(0, 20) };
}
