// Dates the way people in Homs say them: «24 تشرين التاني», not «24 نوفمبر».
// Phones' built-in Arabic dates use Egyptian month names, so we name them here.

const MONTHS = [
  "كانون التاني", "شباط", "آذار", "نيسان", "أيار", "حزيران",
  "تموز", "آب", "أيلول", "تشرين الأول", "تشرين التاني", "كانون الأول",
];

const pad = (n: number) => String(n).padStart(2, "0");

/** «24 تشرين التاني» (plus the year when it is not this year). */
export function syrianDay(input: number | string | Date, now = new Date()): string {
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return "";
  const base = `${d.getDate()} ${MONTHS[d.getMonth()]}`;
  return d.getFullYear() === now.getFullYear() ? base : `${base} ${d.getFullYear()}`;
}

/** «8:24 م» — 12-hour clock with ص / م. */
export function syrianTime(input: number | string | Date): string {
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return "";
  const h = d.getHours();
  return `${h % 12 === 0 ? 12 : h % 12}:${pad(d.getMinutes())} ${h < 12 ? "ص" : "م"}`;
}

/** «اليوم · 8:24 م», «مبارح · 8:24 م», or «24 تشرين التاني · 8:24 م». */
export function syrianDateTime(input: number | string | Date, now = new Date()): string {
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return "";
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOf(now) - startOf(d)) / 86_400_000);
  const day = days === 0 ? "اليوم" : days === 1 ? "مبارح" : syrianDay(d, now);
  return `${day} · ${syrianTime(d)}`;
}
