const pad = (n: number) => String(n).padStart(2, '0');

export function formatTime(timestamp: number): string {
  const d = new Date(timestamp);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function formatDate(timestamp: number): string {
  const d = new Date(timestamp);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

export function formatDateTime(timestamp: number): string {
  const d = new Date(timestamp);
  return `${formatDate(timestamp)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** "1 medición" / "3 mediciones". */
export function plural(count: number, singular: string, pluralForm: string): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

/** Número con unidad, o un guion si el valor no se midió. */
export function formatValue(
  value: number | null | undefined,
  unit = '',
  decimals = 0,
): string {
  if (value === null || value === undefined) {
    return '—';
  }
  return `${value.toFixed(decimals)}${unit ? ` ${unit}` : ''}`;
}

/** Fecha local para un campo de texto: AAAA-MM-DD. */
export function toDateInput(timestamp: number | null): string {
  if (timestamp === null) {
    return '';
  }
  const d = new Date(timestamp);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Interpreta AAAA-MM-DD en hora local. `endOfDay` devuelve el último
 * milisegundo del día (para el extremo "hasta" de un rango inclusivo).
 * Devuelve null si el texto está vacío y undefined si no es una fecha válida.
 */
export function parseDateInput(
  text: string,
  endOfDay = false,
): number | null | undefined {
  const trimmed = text.trim();
  if (!trimmed) {
    return null;
  }
  const match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(trimmed);
  if (!match) {
    return undefined;
  }
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = endOfDay
    ? new Date(year, month - 1, day, 23, 59, 59, 999)
    : new Date(year, month - 1, day, 0, 0, 0, 0);
  // Date normaliza fechas imposibles (31/02 -> 03/03): se rechazan.
  if (date.getMonth() !== month - 1 || date.getDate() !== day) {
    return undefined;
  }
  return date.getTime();
}
