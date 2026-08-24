/** @param {unknown} value @returns {value is string} */
export function isIsoDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/** @param {unknown} start @param {unknown} end */
export function isIsoDateRange(start, end) {
  if (!isIsoDate(start) || !isIsoDate(end)) return false;
  return start <= end;
}

/** @param {unknown} value */
function csvCell(value) {
  if (value == null) return '';
  let text = String(value);
  // Empêche l'exécution de formules lors de l'ouverture dans un tableur.
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[;"\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/** @param {Array<Record<string, unknown>>} rows */
export function rowsToCsv(rows) {
  if (rows.length === 0) return '\uFEFF';
  const firstRow = rows[0];
  if (!firstRow) return '\uFEFF';
  const columns = Object.keys(firstRow);
  const lines = [columns.map(csvCell).join(';')];
  for (const row of rows) lines.push(columns.map((column) => csvCell(row[column])).join(';'));
  return `\uFEFF${lines.join('\n')}\n`;
}
