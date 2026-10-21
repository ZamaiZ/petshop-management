import "server-only";
import { Workbook } from "exceljs";

export type XlsxValue = string | number | Date | null | undefined;

function isCurrencyColumn(header: string) {
  return /valor|total|recebido|troco|saldo|pago|taxa|faturamento|original|aberto/i.test(header);
}

function widthFor(header: string) {
  return Math.min(42, Math.max(14, header.length + 5));
}

export async function xlsxResponse(filename: string, sheetName: string, headers: string[], rows: XlsxValue[][]) {
  const workbook = new Workbook();
  workbook.creator = "Pet Shop";
  workbook.created = new Date();
  const sheet = workbook.addWorksheet(sheetName.slice(0, 31), { views: [{ state: "frozen", ySplit: 1 }] });
  sheet.columns = headers.map((header) => ({ header, key: header, width: widthFor(header) }));
  sheet.addRows(rows);
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: Math.max(1, rows.length + 1), column: headers.length },
  };

  const headerRow = sheet.getRow(1);
  headerRow.height = 24;
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF172554" } };
    cell.alignment = { vertical: "middle" };
  });

  for (let rowIndex = 2; rowIndex <= rows.length + 1; rowIndex += 1) {
    const row = sheet.getRow(rowIndex);
    row.eachCell({ includeEmpty: true }, (cell, columnIndex) => {
      const header = headers[columnIndex - 1] ?? "";
      if (cell.value instanceof Date) {
        cell.numFmt = /hora|data e hora/i.test(header) ? "dd/mm/yyyy hh:mm" : "dd/mm/yyyy";
      } else if (typeof cell.value === "number" && isCurrencyColumn(header)) {
        cell.numFmt = '"R$" #,##0.00';
      } else if (typeof cell.value === "string") {
        cell.numFmt = "@";
      }
      cell.alignment = { vertical: "middle", wrapText: false };
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const safeFilename = filename.replace(/[\\"\r\n]/g, "-");
  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${safeFilename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}

export function excelDateTime(value: string, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(value));
  const values = new Map(parts.map(({ type, value: part }) => [type, part]));
  return new Date(Date.UTC(
    Number(values.get("year")), Number(values.get("month")) - 1, Number(values.get("day")),
    Number(values.get("hour")), Number(values.get("minute")), Number(values.get("second")),
  ));
}

export function excelDate(value: string | null) {
  return value ? new Date(`${value}T00:00:00.000Z`) : null;
}
