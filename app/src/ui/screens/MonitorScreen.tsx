import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { qualityBand } from '../../engine/quality';
import { useMonitorStore } from '../../store/monitorStore';
import { useSettingsStore } from '../../store/settingsStore';
import {
  NETWORK_LABELS,
  type MeasurePhase,
  type NetworkSnapshot,
  type PingResult,
} from '../../types';
import { Button, Card, Stat } from '../components/common';
import { formatTime, formatValue, plural } from '../format';
import { colors, radius, spacing } from '../theme';

const PHASE_LABELS: Record<MeasurePhase, string> = {
  idle: 'En espera',
  network: 'Leyendo estado de la red…',
  location: 'Obteniendo ubicación…',
  ping: 'Midiendo latencia…',
  download: 'Test de descarga…',
  upload: 'Test de subida…',
  saving: 'Guardando medición…',
};

function SignalBars({ level }: { level: number | null }) {
  return (
    <View
      style={styles.bars}
      accessibilityLabel={
        level === null ? 'Nivel de señal no disponible' : `Señal ${level} de 4`
      }>
      {[1, 2, 3, 4].map(bar => (
        <View
          key={bar}
          style={[
            styles.bar,
            { height: 6 + bar * 5 },
            level !== null && bar <= level && styles.barOn,
          ]}
        />
      ))}
    </View>
  );
}

function NetworkCard({ network }: { network: NetworkSnapshot | null }) {
  if (!network) {
    return (
      <Card title="Red activa">
        <Text style={styles.muted}>Leyendo estado de la red…</Text>
      </Card>
    );
  }
  const isCellular = ['2g', '3g', '4g', '5g'].includes(network.kind);
  return (
    <Card title="Red activa">
      <View style={styles.row}>
        <View style={styles.flex}>
          <Text style={styles.networkKind}>
            {NETWORK_LABELS[network.kind]}
            {network.detail ? (
              <Text style={styles.networkDetail}> · {network.detail}</Text>
            ) : null}
          </Text>
          <Text style={styles.muted}>
            {network.kind === 'wifi'
              ? 'Conexión WiFi'
              : network.carrier ?? 'Operador no disponible'}
          </Text>
          <Text
            style={[
              styles.status,
              { color: network.isConnected ? colors.success : colors.danger },
            ]}>
            {!network.isConnected
              ? 'Sin conexión'
              : network.isInternetReachable === false
              ? 'Conectado, sin acceso a Internet'
              : 'Conectado'}
          </Text>
        </View>
        <View style={styles.signalBox}>
          <SignalBars level={network.signalLevel} />
          <Text style={styles.signalDbm}>
            {formatValue(network.signalDbm, 'dBm')}
          </Text>
        </View>
      </View>
      {isCellular &&
      (network.rsrp !== null || network.rsrq !== null || network.sinr !== null) ? (
        <View style={[styles.row, styles.radioRow]}>
          <Stat label="RSRP" value={formatValue(network.rsrp, 'dBm')} />
          <Stat label="RSRQ" value={formatValue(network.rsrq, 'dB')} />
          <Stat label="SINR" value={formatValue(network.sinr, 'dB')} />
        </View>
      ) : null}
    </Card>
  );
}

function PingTable({ pings }: { pings: PingResult[] }) {
  if (pings.length === 0) {
    return <Text style={styles.muted}>Todavía no hay sondas de latencia.</Text>;
  }
  return (
    <View>
      <View style={styles.tableRow}>
        <Text style={[styles.th, styles.hostCol]}>Host</Text>
        {['mín', 'prom', 'máx', 'jitter', 'pérd.'].map(header => (
          <Text key={header} style={[styles.th, styles.numCol]}>
            {header}
          </Text>
        ))}
      </View>
      {pings.map(ping => (
        <View key={ping.host.id} style={styles.tableRow}>
          <View style={styles.hostCol}>
            <Text style={styles.td} numberOfLines={1}>
              {ping.host.label}
            </Text>
            <Text style={styles.hostAddress} numberOfLines={1}>
              {ping.host.host}:{ping.host.port}
            </Text>
          </View>
          <Text style={[styles.td, styles.numCol]}>{formatValue(ping.minMs)}</Text>
          <Text style={[styles.td, styles.numCol]}>{formatValue(ping.avgMs)}</Text>
          <Text style={[styles.td, styles.numCol]}>{formatValue(ping.maxMs)}</Text>
          <Text style={[styles.td, styles.numCol]}>
            {formatValue(ping.jitterMs, '', 1)}
          </Text>
          <Text
            style={[
              styles.td,
              styles.numCol,
              ping.lossPct > 0 && { color: colors.warning },
            ]}>
            {ping.lossPct.toFixed(0)}%
          </Text>
        </View>
      ))}
      <Text style={styles.footnote}>RTT en ms (handshake TCP)</Text>
    </View>
  );
}

function Countdown({ target }: { target: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const seconds = Math.max(0, Math.ceil((target - now) / 1000));
  return <Text style={styles.muted}>Próxima muestra en {seconds} s</Text>;
}

export function MonitorScreen() {
  const insets = useSafeAreaInsets();
  const network = useMonitorStore(s => s.network);
  const phase = useMonitorStore(s => s.phase);
  const livePings = useMonitorStore(s => s.livePings);
  const liveDown = useMonitorStore(s => s.liveDownMbps);
  const liveUp = useMonitorStore(s => s.liveUpMbps);
  const last = useMonitorStore(s => s.last);
  const monitoring = useMonitorStore(s => s.monitoring);
  const sessionSamples = useMonitorStore(s => s.sessionSamples);
  const nextSampleAt = useMonitorStore(s => s.nextSampleAt);
  const error = useMonitorStore(s => s.error);
  const measureOnce = useMonitorStore(s => s.measureOnce);
  const startMonitoring = useMonitorStore(s => s.startMonitoring);
  const stopMonitoring = useMonitorStore(s => s.stopMonitoring);
  const interval = useSettingsStore(s => s.settings.sampleIntervalSec);

  const busy = phase !== 'idle';
  // Mientras se mide se muestran los parciales; en reposo, la última medición.
  const pings = busy && livePings.length > 0 ? livePings : last?.pings ?? livePings;
  const down = busy ? liveDown : last?.downMbps ?? null;
  const up = busy ? liveUp : last?.upMbps ?? null;
  const band = last ? qualityBand(last.quality) : null;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.lg }]}>
      <Text style={styles.title}>Network QoS Monitor</Text>

      <NetworkCard network={network} />

      <Card>
        <View style={styles.row}>
          <Button
            label="Medir ahora"
            onPress={measureOnce}
            disabled={busy || monitoring}
            style={styles.flex}
          />
          <View style={styles.gap} />
          {monitoring ? (
            <Button
              label="Detener sesión"
              variant="danger"
              onPress={stopMonitoring}
              style={styles.flex}
            />
          ) : (
            <Button
              label="Iniciar sesión"
              variant="secondary"
              onPress={startMonitoring}
              disabled={busy}
              style={styles.flex}
            />
          )}
        </View>
        <View style={styles.statusLine}>
          <Text style={[styles.phase, busy && { color: colors.primary }]}>
            {PHASE_LABELS[phase]}
          </Text>
          {monitoring ? (
            <Text style={styles.muted}>
              Sesión activa · {plural(sessionSamples, 'muestra', 'muestras')} ·
              cada {interval} s
            </Text>
          ) : null}
          {monitoring && !busy && nextSampleAt ? (
            <Countdown target={nextSampleAt} />
          ) : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>
      </Card>

      <Card title="Throughput">
        <View style={styles.row}>
          <Stat
            label="Descarga (Mbps)"
            value={formatValue(down, '', 2)}
            color={colors.download}
          />
          <Stat
            label="Subida (Mbps)"
            value={formatValue(up, '', 2)}
            color={colors.upload}
          />
        </View>
        {!busy && last && last.connected && last.downMbps === null ? (
          <Text style={styles.footnote}>
            La última medición no incluyó throughput (backend inaccesible o test
            desactivado).
          </Text>
        ) : null}
      </Card>

      <Card title="Latencia por host">
        <PingTable pings={pings} />
      </Card>

      {last && band ? (
        <Card title="Última medición">
          <View style={styles.row}>
            <View style={[styles.qualityBadge, { borderColor: band.color }]}>
              <Text style={[styles.qualityScore, { color: band.color }]}>
                {last.quality}
              </Text>
              <Text style={[styles.qualityLabel, { color: band.color }]}>
                {band.label}
              </Text>
            </View>
            <View style={styles.flex}>
              <View style={styles.row}>
                <Stat label="RTT prom." value={formatValue(last.rttAvg, 'ms')} />
                <Stat label="Jitter" value={formatValue(last.jitter, 'ms')} />
                <Stat label="Pérdida" value={formatValue(last.lossPct, '%')} />
              </View>
              <Text style={[styles.muted, styles.lastMeta]}>
                {formatTime(last.timestamp)} ·{' '}
                {last.latitude !== null && last.longitude !== null
                  ? `${last.latitude.toFixed(5)}, ${last.longitude.toFixed(5)}`
                  : 'sin ubicación'}
              </Text>
            </View>
          </View>
        </Card>
      ) : null}
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
  row: { flexDirection: 'row', alignItems: 'center' },
  flex: { flex: 1 },
  gap: { width: spacing.md },
  muted: { color: colors.textMuted, fontSize: 13 },
  networkKind: { color: colors.text, fontSize: 26, fontWeight: '800' },
  networkDetail: { color: colors.textMuted, fontSize: 16, fontWeight: '600' },
  status: { fontSize: 13, fontWeight: '600', marginTop: spacing.xs },
  signalBox: { alignItems: 'center' },
  signalDbm: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
    marginTop: spacing.xs,
    fontVariant: ['tabular-nums'],
  },
  bars: { flexDirection: 'row', alignItems: 'flex-end', height: 28 },
  bar: {
    width: 7,
    marginHorizontal: 2,
    borderRadius: 2,
    backgroundColor: colors.border,
  },
  barOn: { backgroundColor: colors.primary },
  radioRow: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  statusLine: { marginTop: spacing.md },
  phase: { color: colors.text, fontSize: 14, fontWeight: '600' },
  error: { color: colors.danger, fontSize: 13, marginTop: spacing.xs },
  footnote: { color: colors.textMuted, fontSize: 11, marginTop: spacing.sm },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  th: { color: colors.textMuted, fontSize: 11, fontWeight: '700' },
  td: { color: colors.text, fontSize: 13, fontVariant: ['tabular-nums'] },
  hostCol: { flex: 2.2 },
  numCol: { flex: 1, textAlign: 'right' },
  hostAddress: { color: colors.textMuted, fontSize: 11 },
  qualityBadge: {
    width: 84,
    height: 84,
    borderRadius: radius.md,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  qualityScore: { fontSize: 28, fontWeight: '800' },
  qualityLabel: { fontSize: 12, fontWeight: '700' },
  lastMeta: { marginTop: spacing.sm, textAlign: 'center' },
});
