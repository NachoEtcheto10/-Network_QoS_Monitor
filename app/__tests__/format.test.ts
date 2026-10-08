import { toBase64, toCsv, toJson } from '../src/export/format';
import type { Measurement } from '../src/types';
import { niceCeil, buildPath } from '../src/ui/components/LineChart';
import { parseDateInput, toDateInput } from '../src/ui/format';

const base: Measurement = {
  id: 'm1',
  sessionId: 's1',
  timestamp: Date.UTC(2026, 9, 7, 12, 0, 0),
  source: 'foreground',
  latitude: -32.48,
  longitude: -58.23,
  accuracy: 8,
  netKind: '4g',
  netDetail: 'LTE',
  carrier: 'Movil, S.A. "AR"',
  connected: true,
  signalDbm: -95,
  signalLevel: 3,
  rsrp: -95,
  rsrq: -11,
  sinr: 9,
  rttMin: 20,
  rttAvg: 31.5,
  rttMax: 60,
  jitter: 4.2,
  lossPct: 0,
  downMbps: 18.25,
  upMbps: null,
  quality: 77,
  pings: [],
};

describe('toCsv', () => {
  it('escribe encabezado y una fila por medición con fin de línea CRLF', () => {
    const lines = toCsv([base]).split('\r\n');
    expect(lines).toHaveLength(3); // encabezado, fila, línea final vacía
    expect(lines[0].split(',')).toHaveLength(25);
    expect(lines[0]).toContain('timestamp_iso');
    expect(lines[1]).toContain('2026-10-07T12:00:00.000Z');
  });

  it('escapa comas y comillas, y deja vacío lo no medido', () => {
    const row = toCsv([base]).split('\r\n')[1];
    expect(row).toContain('"Movil, S.A. ""AR"""');
    // upload_mbps es null: campo vacío entre download y quality
    expect(row.endsWith(',18.25,,77')).toBe(true);
  });

  it('con historial vacío devuelve solo el encabezado', () => {
    expect(toCsv([]).trim().split('\r\n')).toHaveLength(1);
  });
});

describe('toJson', () => {
  it('incluye el conteo y las mediciones completas', () => {
    const parsed = JSON.parse(toJson([base]));
    expect(parsed.count).toBe(1);
    expect(parsed.measurements[0].carrier).toBe(base.carrier);
  });
});

describe('toBase64', () => {
  it('coincide con la codificación estándar, incluido el padding', () => {
    expect(toBase64('')).toBe('');
    expect(toBase64('a')).toBe('YQ==');
    expect(toBase64('ab')).toBe('YWI=');
    expect(toBase64('abc')).toBe('YWJj');
    expect(toBase64('Mediciones QoS')).toBe('TWVkaWNpb25lcyBRb1M=');
  });

  it('codifica UTF-8 (acentos y símbolos fuera del BMP)', () => {
    expect(toBase64('señal débil')).toBe('c2XDsWFsIGTDqWJpbA==');
    expect(toBase64('RTT → 20 ms')).toBe('UlRUIOKGkiAyMCBtcw==');
    expect(toBase64('ok 📶')).toBe('b2sg8J+Ttg==');
  });
});

describe('fechas del filtro', () => {
  it('interpreta AAAA-MM-DD en hora local, con fin de día opcional', () => {
    const from = parseDateInput('2026-10-07') as number;
    const to = parseDateInput('2026-10-07', true) as number;
    expect(new Date(from).getHours()).toBe(0);
    expect(to - from).toBe(24 * 60 * 60 * 1000 - 1);
    expect(toDateInput(from)).toBe('2026-10-07');
  });

  it('distingue vacío (sin filtro) de inválido', () => {
    expect(parseDateInput('  ')).toBeNull();
    expect(parseDateInput('07/10/2026')).toBeUndefined();
    expect(parseDateInput('2026-02-31')).toBeUndefined();
    expect(parseDateInput('2026-13-01')).toBeUndefined();
  });
});

describe('helpers del gráfico', () => {
  it('niceCeil redondea hacia arriba a 1, 2, 5 x 10^n', () => {
    expect(niceCeil(0)).toBe(1);
    expect(niceCeil(7)).toBe(10);
    expect(niceCeil(13)).toBe(20);
    expect(niceCeil(230)).toBe(500);
    expect(niceCeil(0.3)).toBeCloseTo(0.5);
  });

  it('buildPath corta la línea en los valores no medidos', () => {
    const path = buildPath(
      [
        { x: 0, y: 1 },
        { x: 1, y: 2 },
        { x: 2, y: null },
        { x: 3, y: 4 },
      ],
      x => x * 10,
      y => y,
    );
    expect(path).toBe('M0.0,1.0 L10.0,2.0 M30.0,4.0');
  });
});
