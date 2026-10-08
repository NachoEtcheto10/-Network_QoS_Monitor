import { open, type DB } from '@op-engineering/op-sqlite';

const MIGRATIONS: string[][] = [
  // v1: esquema inicial
  [
    `CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY NOT NULL,
      started_at INTEGER NOT NULL,
      ended_at INTEGER,
      kind TEXT NOT NULL,
      label TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS measurements (
      id TEXT PRIMARY KEY NOT NULL,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      timestamp INTEGER NOT NULL,
      source TEXT NOT NULL,
      latitude REAL,
      longitude REAL,
      accuracy REAL,
      net_kind TEXT NOT NULL,
      net_detail TEXT,
      carrier TEXT,
      connected INTEGER NOT NULL,
      signal_dbm REAL,
      signal_level INTEGER,
      rsrp REAL,
      rsrq REAL,
      sinr REAL,
      rtt_min REAL,
      rtt_avg REAL,
      rtt_max REAL,
      jitter REAL,
      loss_pct REAL,
      down_mbps REAL,
      up_mbps REAL,
      quality REAL NOT NULL,
      pings_json TEXT NOT NULL
    )`,
    'CREATE INDEX IF NOT EXISTS idx_measurements_timestamp ON measurements(timestamp)',
    'CREATE INDEX IF NOT EXISTS idx_measurements_session ON measurements(session_id, timestamp)',
    'CREATE INDEX IF NOT EXISTS idx_measurements_geo ON measurements(latitude, longitude)',
    `CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL
    )`,
  ],
];

let dbPromise: Promise<DB> | null = null;

async function migrate(db: DB): Promise<void> {
  await db.execute('PRAGMA foreign_keys = ON');
  const result = await db.execute('PRAGMA user_version');
  const current = Number(result.rows[0]?.user_version ?? 0);

  for (let version = current; version < MIGRATIONS.length; version++) {
    await db.transaction(async tx => {
      for (const statement of MIGRATIONS[version]) {
        await tx.execute(statement);
      }
    });
    await db.execute(`PRAGMA user_version = ${version + 1}`);
  }
}

/**
 * Conexión única a la base, abierta y migrada en el primer uso. La comparten
 * la UI y la tarea headless de background (que corre en un contexto JS propio
 * y por eso vuelve a pasar por acá).
 */
export function getDb(): Promise<DB> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = open({ name: 'qos-monitor.sqlite' });
      await migrate(db);
      return db;
    })();
    dbPromise.catch(() => {
      dbPromise = null;
    });
  }
  return dbPromise;
}
