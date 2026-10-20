// CSV for the reports: built in the browser (or by the server) and handed over
// as a download.

export function csvCell(v: string | number | null | undefined): string {
  const s = v == null ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Rows of cells to CRLF lines, header first. */
export function csvLines(rows: (string | number | null | undefined)[][]): string {
  return rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

export function downloadCsv(text: string, filename: string) {
  downloadBlob(new Blob([text], { type: 'text/csv;charset=utf-8' }), filename);
}

/** A file the server built (a report's `export.csv`), handed over as a download. */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
