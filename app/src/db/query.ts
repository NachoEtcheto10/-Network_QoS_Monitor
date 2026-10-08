import type { HistoryFilter } from '../types';

export interface SqlQuery {
  sql: string;
  params: (string | number)[];
}

/**
 * Arma el SELECT de mediciones para un filtro de historial. Todos los valores
 * viajan como parámetros; el filtro por zona usa el índice (latitude,
 * longitude) y, por definición, excluye las mediciones sin coordenadas.
 */
export function buildMeasurementQuery(
  filter: HistoryFilter,
  limit?: number,
): SqlQuery {
  const where: string[] = [];
  const params: (string | number)[] = [];

  if (filter.sessionId) {
    where.push('session_id = ?');
    params.push(filter.sessionId);
  }
  if (filter.kinds.length > 0) {
    where.push(`net_kind IN (${filter.kinds.map(() => '?').join(', ')})`);
    params.push(...filter.kinds);
  }
  if (filter.from !== null) {
    where.push('timestamp >= ?');
    params.push(filter.from);
  }
  if (filter.to !== null) {
    where.push('timestamp <= ?');
    params.push(filter.to);
  }
  if (filter.bounds) {
    where.push('latitude BETWEEN ? AND ?', 'longitude BETWEEN ? AND ?');
    params.push(
      filter.bounds.minLat,
      filter.bounds.maxLat,
      filter.bounds.minLon,
      filter.bounds.maxLon,
    );
  }

  let sql = 'SELECT * FROM measurements';
  if (where.length > 0) {
    sql += ` WHERE ${where.join(' AND ')}`;
  }
  sql += ' ORDER BY timestamp DESC';
  if (limit !== undefined) {
    sql += ' LIMIT ?';
    params.push(limit);
  }
  return { sql, params };
}
