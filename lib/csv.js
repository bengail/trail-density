export function csvCell(value) {
  const s = value === null || value === undefined ? "" : String(value);
  return `"${s.replace(/"/g, '""')}"`;
}

export function rowsToCsv(rows) {
  const header = ["Race", "Country", "Series", "RCI3", "RCI5", "RCI10", "RCI20"];
  const lines = [header.map(csvCell).join(",")];
  for (const r of rows) {
    lines.push([
      r.name, r.country || "", r.series || "",
      Number.isFinite(r.rc3) ? r.rc3.toFixed(2) : "",
      Number.isFinite(r.rc5) ? r.rc5.toFixed(2) : "",
      Number.isFinite(r.rc10) ? r.rc10.toFixed(2) : "",
      Number.isFinite(r.rc20) ? r.rc20.toFixed(2) : ""
    ].map(csvCell).join(","));
  }
  return lines.join("\n");
}
