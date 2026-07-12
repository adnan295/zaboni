// Robust, numeric date formatting for the app.
//
// Two things this guards against:
//  1. React Native's Hermes engine can only parse strict ISO strings
//     ("2026-06-24T21:00:00Z"). PostgreSQL-format timestamps
//     ("2026-06-24 21:00:00+00") make `new Date()` return Invalid Date, which
//     used to render literally as "Invalid Date" in the courier screens.
//  2. Missing / null dates — we render a neutral dash instead of crashing.
//
// Output uses Arabic-Indic digits in a numeric DD/MM/YYYY layout to match the
// rest of the UI while staying purely numeric (no locale month names).

const AR_DIGITS = ["٠", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩"];

function toArabicDigits(s: string): string {
  return s.replace(/[0-9]/g, (d) => AR_DIGITS[Number(d)]);
}

function parseDate(input?: string | number | Date | null): Date | null {
  if (input == null || input === "") return null;
  if (input instanceof Date) return isNaN(input.getTime()) ? null : input;

  let d = new Date(input);
  if (isNaN(d.getTime()) && typeof input === "string") {
    // Fall back for Postgres-style timestamps that Hermes can't parse:
    // turn "2026-06-24 21:00:00+00" into "2026-06-24T21:00:00+00".
    d = new Date(input.replace(" ", "T"));
  }
  return isNaN(d.getTime()) ? null : d;
}

/** Numeric date only, e.g. ٢٤/٠٦/٢٠٢٦ — dash when missing/invalid. */
export function formatDate(input?: string | number | Date | null): string {
  const d = parseDate(input);
  if (!d) return "—";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = String(d.getFullYear());
  return toArabicDigits(`${dd}/${mm}/${yyyy}`);
}

/** Numeric date + 12-hour time, e.g. ٢٤/٠٦/٢٠٢٦ ٠٩:٠٥ م — dash when missing/invalid. */
export function formatDateTime(input?: string | number | Date | null): string {
  const d = parseDate(input);
  if (!d) return "—";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = String(d.getFullYear());
  let h = d.getHours();
  const min = String(d.getMinutes()).padStart(2, "0");
  const ampm = h < 12 ? "ص" : "م";
  h = h % 12;
  if (h === 0) h = 12;
  const hh = String(h).padStart(2, "0");
  return `${toArabicDigits(`${dd}/${mm}/${yyyy} ${hh}:${min}`)} ${ampm}`;
}
