import type { Measurement } from '../types';

const CSV_COLUMNS: [string, (m: Measurement) => string | number | null][] = [
  ['id', m => m.id],
  ['session_id', m => m.sessionId],
  ['timestamp_iso', m => new Date(m.timestamp).toISOString()],
  ['timestamp_ms', m => m.timestamp],
  ['source', m => m.source],
  ['latitude', m => m.latitude],
  ['longitude', m => m.longitude],
  ['accuracy_m', m => m.accuracy],
  ['network_type', m => m.netKind],
  ['radio_technology', m => m.netDetail],
  ['carrier', m => m.carrier],
  ['connected', m => (m.connected ? 1 : 0)],
  ['signal_dbm', m => m.signalDbm],
  ['signal_level', m => m.signalLevel],
  ['rsrp', m => m.rsrp],
  ['rsrq', m => m.rsrq],
  ['sinr', m => m.sinr],
  ['rtt_min_ms', m => m.rttMin],
  ['rtt_avg_ms', m => m.rttAvg],
  ['rtt_max_ms', m => m.rttMax],
  ['jitter_ms', m => m.jitter],
  ['loss_pct', m => m.lossPct],
  ['download_mbps', m => m.downMbps],
  ['upload_mbps', m => m.upMbps],
  ['quality', m => m.quality],
];

function csvCell(value: string | number | null): string {
  if (value === null) {
    return '';
  }
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** CSV (RFC 4180) con una fila por medición; los valores no medidos van vacíos. */
export function toCsv(measurements: Measurement[]): string {
  const lines = [CSV_COLUMNS.map(([name]) => name).join(',')];
  for (const m of measurements) {
    lines.push(CSV_COLUMNS.map(([, get]) => csvCell(get(m))).join(','));
  }
  return lines.join('\r\n') + '\r\n';
}

/** JSON con el detalle completo, incluidas las sondas por host. */
export function toJson(measurements: Measurement[]): string {
  return JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      count: measurements.length,
      measurements,
    },
    null,
    2,
  );
}

/* eslint-disable no-bitwise -- la codificación UTF-8/base64 opera sobre bits */
const B64 ='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function utf8Bytes(text: string): number[] {
  const bytes: number[] = [];
  for (const char of text) {
    const code = char.codePointAt(0) as number;
    if (code < 0x80) {
      bytes.push(code);
    } else if (code < 0x800) {
      bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else if (code < 0x10000) {
      bytes.push(
        0xe0 | (code >> 12),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f),
      );
    } else {
      bytes.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f),
      );
    }
  }
  return bytes;
}

/** Base64 de un string codificado como UTF-8 (para compartirlo como data URL). */
export function toBase64(text: string): string {
  const bytes = utf8Bytes(text);
  const out: string[] = [];
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = bytes[i + 1];
    const b2 = bytes[i + 2];
    out.push(
      B64[b0 >> 2],
      B64[((b0 & 0x03) << 4) | ((b1 ?? 0) >> 4)],
      b1 === undefined ? '=' : B64[((b1 & 0x0f) << 2) | ((b2 ?? 0) >> 6)],
      b2 === undefined ? '=' : B64[b2 & 0x3f],
    );
  }
  return out.join('');
}
