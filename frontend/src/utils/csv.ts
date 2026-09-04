const EMAIL_REGEX =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

export function isValidEmail(value: string): boolean {
  return EMAIL_REGEX.test(value.trim());
}

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      i += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === ',' && !inQuotes) {
      cells.push(current.trim());
      current = '';
      continue;
    }

    current += char;
  }

  cells.push(current.trim());
  return cells;
}

function extractEmailsFromText(text: string): string[] {
  const matches = text.match(
    /[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+/g,
  );
  return matches ?? [];
}

export interface CsvParseResult {
  emails: string[];
  totalRows: number;
  invalidCount: number;
  duplicateCount: number;
  fileName: string;
}

/**
 * Parse CSV content for lead emails.
 * Prefers an "email" column when present; otherwise scans all cells.
 */
export function parseLeadCsv(
  content: string,
  fileName: string,
): CsvParseResult {
  const lines = content
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    return {
      emails: [],
      totalRows: 0,
      invalidCount: 0,
      duplicateCount: 0,
      fileName,
    };
  }

  const rows = lines.map(parseCsvLine);
  const header = rows[0].map((cell) => cell.toLowerCase());
  const emailColumnIndex = header.findIndex(
    (cell) => cell === 'email' || cell === 'email address' || cell === 'e-mail',
  );

  const candidates: string[] = [];
  let invalidCount = 0;
  let dataRowCount = 0;

  if (emailColumnIndex >= 0) {
    for (const row of rows.slice(1)) {
      dataRowCount += 1;
      const value = (row[emailColumnIndex] ?? '').trim();
      if (!value) continue;
      if (isValidEmail(value)) {
        candidates.push(value.toLowerCase());
      } else {
        invalidCount += 1;
      }
    }
  } else {
    dataRowCount = rows.length;
    for (const row of rows) {
      for (const cell of row) {
        const found = extractEmailsFromText(cell);
        if (found.length === 0 && cell.includes('@')) {
          invalidCount += 1;
        }
        for (const match of found) {
          if (isValidEmail(match)) {
            candidates.push(match.toLowerCase());
          } else {
            invalidCount += 1;
          }
        }
      }
    }
  }

  const seen = new Set<string>();
  const emails: string[] = [];
  let duplicateCount = 0;

  for (const email of candidates) {
    if (seen.has(email)) {
      duplicateCount += 1;
      continue;
    }
    seen.add(email);
    emails.push(email);
  }

  return {
    emails,
    totalRows: dataRowCount,
    invalidCount,
    duplicateCount,
    fileName,
  };
}
