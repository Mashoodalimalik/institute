export function pakistanDate(value: string | Date = new Date()): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error('Invalid timestamp');
  return new Date(date.getTime() + 5 * 3600000).toISOString().slice(0, 10);
}

export function pakistanDayBounds(value: string | Date = new Date()) {
  const start = new Date(`${pakistanDate(value)}T00:00:00+05:00`);
  return { start: start.toISOString(), end: new Date(start.getTime() + 86400000).toISOString() };
}

export function monthBounds(month: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('Invalid month');
  const [year, number] = month.split('-').map(Number);
  return { start: `${month}-01`, end: new Date(Date.UTC(year, number, 1)).toISOString().slice(0, 10) };
}
