import { buildMeasurementQuery } from '../src/db/query';
import type { HistoryFilter } from '../src/types';

const empty: HistoryFilter = { kinds: [], from: null, to: null, bounds: null };

describe('buildMeasurementQuery', () => {
  it('sin filtros trae todo, del más reciente al más antiguo', () => {
    expect(buildMeasurementQuery(empty)).toEqual({
      sql: 'SELECT * FROM measurements ORDER BY timestamp DESC',
      params: [],
    });
  });

  it('combina tipo de red, rango de fechas y zona con parámetros', () => {
    const { sql, params } = buildMeasurementQuery(
      {
        kinds: ['wifi', '4g'],
        from: 1000,
        to: 2000,
        bounds: { minLat: -33, maxLat: -32, minLon: -59, maxLon: -58 },
      },
      50,
    );
    expect(sql).toBe(
      'SELECT * FROM measurements WHERE net_kind IN (?, ?) AND timestamp >= ? ' +
        'AND timestamp <= ? AND latitude BETWEEN ? AND ? AND longitude BETWEEN ? AND ? ' +
        'ORDER BY timestamp DESC LIMIT ?',
    );
    expect(params).toEqual(['wifi', '4g', 1000, 2000, -33, -32, -59, -58, 50]);
  });

  it('filtra por sesión', () => {
    const { sql, params } = buildMeasurementQuery({ ...empty, sessionId: 'abc' });
    expect(sql).toContain('WHERE session_id = ?');
    expect(params).toEqual(['abc']);
  });

  it('acepta un extremo de fecha abierto', () => {
    const { sql, params } = buildMeasurementQuery({ ...empty, from: 5 });
    expect(sql).toContain('timestamp >= ?');
    expect(sql).not.toContain('timestamp <= ?');
    expect(params).toEqual([5]);
  });
});
