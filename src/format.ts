const feet = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

export function formatFeet(amount: number): string {
  return `${feet.format(amount)} ft`;
}

const dateFmt = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

/** "2026-09-28" -> "28 Sep 2026" (parsed as a local date, not UTC). */
export function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return dateFmt.format(new Date(y, m - 1, d));
}

/** Today's local date as YYYY-MM-DD. */
export function isoToday(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}
