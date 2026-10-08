import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { queryMeasurements } from '../../db/repository';
import { round } from '../../engine/stats';
import { EMPTY_FILTER, useHistoryStore } from '../../store/historyStore';
import type { Measurement } from '../../types';
import { Card, Chip, EmptyState, Stat } from '../components/common';
import { LineChart } from '../components/LineChart';
import { formatDateTime, formatValue, plural } from '../format';
import { colors, spacing } from '../theme';

function average(values: (number | null)[]): number | null {
  const present = values.filter((v): v is number => v !== null);
  if (present.length === 0) {
    return null;
  }
  return round(present.reduce((acc, v) => acc + v, 0) / present.length, 1);
}

export function ChartsScreen() {
  const insets = useSafeAreaInsets();
  const sessions = useHistoryStore(s => s.sessions);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [data, setData] = useState<Measurement[]>([]);

  // Sesión elegida, o la más reciente si la elegida ya no existe.
  const session = sessions.find(s => s.id === selectedId) ?? sessions[0] ?? null;
  const sessionId = session?.id ?? null;
  const sessionCount = session?.count ?? 0;

  // Los gráficos son por sesión e ignoran los filtros del historial. Se vuelve
  // a consultar cuando la sesión recibe muestras nuevas (cambia su conteo).
  useEffect(() => {
    if (!sessionId) {
      setData([]);
      return;
    }
    let cancelled = false;
    queryMeasurements({ ...EMPTY_FILTER, sessionId }).then(rows => {
      if (!cancelled) {
        setData(rows.reverse());
      }
    });
    return () => {
      cancelled = true;
    };
  }, [sessionId, sessionCount]);

  const latencySeries = useMemo(
    () => [
      {
        label: 'RTT promedio',
        color: colors.latency,
        points: data.map(m => ({ x: m.timestamp, y: m.rttAvg })),
      },
      {
        label: 'Jitter',
        color: colors.jitter,
        points: data.map(m => ({ x: m.timestamp, y: m.jitter })),
      },
    ],
    [data],
  );
  const throughputSeries = useMemo(
    () => [
      {
        label: 'Descarga',
        color: colors.download,
        points: data.map(m => ({ x: m.timestamp, y: m.downMbps })),
      },
      {
        label: 'Subida',
        color: colors.upload,
        points: data.map(m => ({ x: m.timestamp, y: m.upMbps })),
      },
    ],
    [data],
  );

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.lg }]}>
      <Text style={styles.title}>Series temporales</Text>

      {sessions.length === 0 ? (
        <EmptyState
          title="Todavía no hay sesiones"
          hint="Hacé una medición o iniciá una sesión de monitoreo para ver cómo evolucionan la latencia y el throughput."
        />
      ) : (
        <>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.sessions}>
            {sessions.map(s => (
              <Chip
                key={s.id}
                label={`${s.label} (${s.count})`}
                selected={s.id === sessionId}
                onPress={() => setSelectedId(s.id)}
              />
            ))}
          </ScrollView>

          {session ? (
            <Card title="Resumen de la sesión">
              <Text style={styles.sessionMeta}>
                {formatDateTime(session.startedAt)}
                {session.endedAt ? ` → ${formatDateTime(session.endedAt)}` : ''} ·{' '}
                {plural(data.length, 'muestra', 'muestras')}
              </Text>
              <View style={styles.row}>
                <Stat
                  label="RTT prom."
                  value={formatValue(average(data.map(m => m.rttAvg)), 'ms')}
                />
                <Stat
                  label="Jitter"
                  value={formatValue(average(data.map(m => m.jitter)), 'ms', 1)}
                />
                <Stat
                  label="↓ Mbps"
                  value={formatValue(average(data.map(m => m.downMbps)), '', 1)}
                />
                <Stat
                  label="↑ Mbps"
                  value={formatValue(average(data.map(m => m.upMbps)), '', 1)}
                />
              </View>
            </Card>
          ) : null}

          <Card title="Latencia">
            <LineChart series={latencySeries} unit="ms" />
          </Card>
          <Card title="Throughput">
            <LineChart series={throughputSeries} unit="Mbps" />
          </Card>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xl },
  title: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '800',
    marginBottom: spacing.lg,
  },
  sessions: { marginBottom: spacing.sm },
  sessionMeta: {
    color: colors.textMuted,
    fontSize: 13,
    marginBottom: spacing.md,
  },
  row: { flexDirection: 'row' },
});
