import type {
  HistoryFilter,
  Measurement,
  NetworkKind,
  Session,
  SessionKind,
} from '../types';
import { getDb } from './database';
import { buildMeasurementQuery } from './query';

type Row = Record<string, unknown>;

const num = (value: unknown): number | null =>
  value === null || value === undefined ? null : Number(value);
const str = (value: unknown): string | null =>
  value === null || value === undefined ? null : String(value);

export function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function rowToMeasurement(row: Row): Measurement {
  let pings: Measurement['pings'] = [];
  try {
    pings = JSON.parse(String(row.pings_json ?? '[]'));
  } catch {
    // fila con JSON corrupto: se conserva la medición sin el detalle por host
  }
  return {
    id: String(row.id),
    sessionId: String(row.session_id),
    timestamp: Number(row.timestamp),
    source: row.source === 'background' ? 'background' : 'foreground',
    latitude: num(row.latitude),
    longitude: num(row.longitude),
    accuracy: num(row.accuracy),
    netKind: String(row.net_kind) as NetworkKind,
    netDetail: str(row.net_detail),
    carrier: str(row.carrier),
    connected: Number(row.connected) === 1,
    signalDbm: num(row.signal_dbm),
    signalLevel: num(row.signal_level),
    rsrp: num(row.rsrp),
    rsrq: num(row.rsrq),
    sinr: num(row.sinr),
    rttMin: num(row.rtt_min),
    rttAvg: num(row.rtt_avg),
    rttMax: num(row.rtt_max),
    jitter: num(row.jitter),
    lossPct: num(row.loss_pct),
    downMbps: num(row.down_mbps),
    upMbps: num(row.up_mbps),
    quality: Number(row.quality),
    pings,
  };
}

export async function insertMeasurement(m: Measurement): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT INTO measurements (
      id, session_id, timestamp, source, latitude, longitude, accuracy,
      net_kind, net_detail, carrier, connected, signal_dbm, signal_level,
      rsrp, rsrq, sinr, rtt_min, rtt_avg, rtt_max, jitter, loss_pct,
      down_mbps, up_mbps, quality, pings_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      m.id,
      m.sessionId,
      m.timestamp,
      m.source,
      m.latitude,
      m.longitude,
      m.accuracy,
      m.netKind,
      m.netDetail,
      m.carrier,
      m.connected ? 1 : 0,
      m.signalDbm,
      m.signalLevel,
      m.rsrp,
      m.rsrq,
      m.sinr,
      m.rttMin,
      m.rttAvg,
      m.rttMax,
      m.jitter,
      m.lossPct,
      m.downMbps,
      m.upMbps,
      m.quality,
      JSON.stringify(m.pings),
    ],
  );
}

export async function queryMeasurements(
  filter: HistoryFilter,
  limit?: number,
): Promise<Measurement[]> {
  const db = await getDb();
  const { sql, params } = buildMeasurementQuery(filter, limit);
  const result = await db.execute(sql, params);
  return result.rows.map(rowToMeasurement);
}

export async function createSession(
  kind: SessionKind,
  label: string,
  id: string = newId(),
): Promise<string> {
  const db = await getDb();
  await db.execute(
    'INSERT OR IGNORE INTO sessions (id, started_at, kind, label) VALUES (?, ?, ?, ?)',
    [id, Date.now(), kind, label],
  );
  return id;
}

export async function endSession(id: string): Promise<void> {
  const db = await getDb();
  await db.execute('UPDATE sessions SET ended_at = ? WHERE id = ?', [
    Date.now(),
    id,
  ]);
}

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Sesión diaria compartida para las mediciones que no pertenecen a un
 * monitoreo continuo: las sueltas ("Medir ahora") y las de background. Así
 * cada día queda como una serie graficable en lugar de N sesiones de un punto.
 */
export async function ensureDailySession(
  kind: Extract<SessionKind, 'single' | 'background'>,
  date: Date = new Date(),
): Promise<string> {
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const label =
    kind === 'background' ? `Segundo plano ${day}` : `Mediciones sueltas ${day}`;
  return createSession(kind, label, `${kind}-${day}`);
}

/** Sesiones con al menos una medición, de la más reciente a la más antigua. */
export async function listSessions(): Promise<Session[]> {
  const db = await getDb();
  const result = await db.execute(
    `SELECT s.id, s.started_at, s.ended_at, s.kind, s.label,
            COUNT(m.id) AS count, MAX(m.timestamp) AS last_ts
       FROM sessions s
       JOIN measurements m ON m.session_id = s.id
      GROUP BY s.id
      ORDER BY last_ts DESC`,
  );
  return result.rows.map(row => ({
    id: String(row.id),
    startedAt: Number(row.started_at),
    endedAt: num(row.ended_at),
    kind: String(row.kind) as SessionKind,
    label: String(row.label),
    count: Number(row.count),
  }));
}

export async function deleteAllMeasurements(): Promise<void> {
  const db = await getDb();
  await db.transaction(async tx => {
    await tx.execute('DELETE FROM measurements');
    await tx.execute('DELETE FROM sessions');
  });
}

export async function getValue(key: string): Promise<string | null> {
  const db = await getDb();
  const result = await db.execute('SELECT value FROM settings WHERE key = ?', [
    key,
  ]);
  return str(result.rows[0]?.value);
}

export async function setValue(key: string, value: string): Promise<void> {
  const db = await getDb();
  await db.execute(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    [key, value],
  );
}
