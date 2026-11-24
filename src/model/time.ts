/* Utilidades de tiempo. El reloj de simulación está en minutos desde el
   lunes 00:00 de la semana simulada. */

export const DAY = 1440;
export const WEEK = 7 * DAY;

/** "HH:MM" → minutos del día, o null si es inválido. */
export function hm(s: string | null | undefined): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(s ?? '').trim());
  if (!m) return null;
  const h = +m[1], mi = +m[2];
  if (h > 23 || mi > 59) return null;
  return h * 60 + mi;
}

/** minutos → "HH:MM" (módulo 24 h). */
export function fmtHM(t: number | null | undefined): string {
  if (t == null || !isFinite(t)) return '—';
  let x = Math.round(t) % DAY;
  if (x < 0) x += DAY;
  return `${String(Math.floor(x / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`;
}


/** Duración en minutos → "1 h 05 min" / "45 min". */
export function fmtDur(m: number | null | undefined): string {
  if (m == null || !isFinite(m)) return '—';
  const neg = m < 0;
  let x = Math.round(Math.abs(m));
  const h = Math.floor(x / 60);
  x = x % 60;
  const s = h ? `${h} h ${String(x).padStart(2, '0')} min` : `${x} min`;
  return neg ? '-' + s : s;
}
