function civilParts(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return { year, month, day };
}

export function addCivilDays(value: string, amount: number) {
  const { year, month, day } = civilParts(value);
  const date = new Date(Date.UTC(year, month - 1, day + amount));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

export function dateKeyAtTimeZone(date = new Date(), timeZone = "America/Sao_Paulo") {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const values = new Map(parts.map(({ type, value }) => [type, value]));
  return `${values.get("year")}-${values.get("month")}-${values.get("day")}`;
}

export function zonedDateTimeToIso(date: string, time: string, timeZone: string) {
  const { year, month, day } = civilParts(date);
  const [hour, minute] = time.split(":").map(Number);
  const target = Date.UTC(year, month - 1, day, hour, minute);
  let timestamp = target;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(timestamp));
    const values = new Map(parts.map(({ type, value }) => [type, value]));
    const represented = Date.UTC(
      Number(values.get("year")),
      Number(values.get("month")) - 1,
      Number(values.get("day")),
      Number(values.get("hour")),
      Number(values.get("minute")),
    );
    const difference = represented - target;
    if (difference === 0) break;
    timestamp -= difference;
  }

  return new Date(timestamp).toISOString();
}

export function localDayRange(date: string, timeZone: string) {
  return {
    start: zonedDateTimeToIso(date, "00:00", timeZone),
    end: zonedDateTimeToIso(addCivilDays(date, 1), "00:00", timeZone),
  };
}

export function dateTimeInTimeZone(value: string, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(value));
  const values = new Map(parts.map(({ type, value: partValue }) => [type, partValue]));
  return {
    date: `${values.get("year")}-${values.get("month")}-${values.get("day")}`,
    time: `${values.get("hour")}:${values.get("minute")}`,
  };
}
