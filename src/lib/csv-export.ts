import { dateKeyAtTimeZone, localDayRange } from "@/lib/date";

export type ExportPeriod = {
  from: string;
  to: string;
  start: string;
  end: string;
};

function isDateKey(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

export function getExportPeriod(params: URLSearchParams, timeZone: string): ExportPeriod | null {
  try {
    const today = dateKeyAtTimeZone(new Date(), timeZone);
    const from = params.get("from") ?? `${today.slice(0, 7)}-01`;
    const to = params.get("to") ?? today;
    if (!isDateKey(from) || !isDateKey(to)) return null;

    const fromDay = Date.parse(`${from}T00:00:00.000Z`);
    const toDay = Date.parse(`${to}T00:00:00.000Z`);
    if (fromDay > toDay || (toDay - fromDay) / 86_400_000 > 365) return null;

    return {
      from,
      to,
      start: localDayRange(from, timeZone).start,
      end: localDayRange(to, timeZone).end,
    };
  } catch {
    return null;
  }
}

type CsvValue = string | number | null | undefined;

function csvCell(value: CsvValue) {
  let text = String(value ?? "");
  if (typeof value === "string" && /^[\s\u0000-\u001f]*[=+@-]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function csvResponse(filename: string, rows: CsvValue[][]) {
  const content = rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
  return new Response(`\uFEFF${content}`, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
