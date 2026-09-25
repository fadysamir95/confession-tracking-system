export function escapeCsvCell(value: string | number | null): string {
  if (value === null) {
    return '""';
  }

  let safeValue = String(value);
  // Spreadsheet programs may ignore leading whitespace before a formula. Protect both the
  // leading-whitespace form and the control-character forms that commonly trigger formulas.
  if (/^[\s]*[=+\-@]/.test(safeValue) || /^[\t\r]/.test(safeValue)) {
    safeValue = `'${safeValue}`;
  }

  return `"${safeValue.replace(/"/g, '""')}"`;
}

export function createCsv(headers: string[], rows: Array<Array<string | number | null>>) {
  return [headers, ...rows]
    .map((row) => row.map(escapeCsvCell).join(","))
    .join("\r\n");
}
