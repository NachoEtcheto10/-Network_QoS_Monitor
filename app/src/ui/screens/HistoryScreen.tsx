import { useEffect, useState } from 'react';
import {
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { queryMeasurements } from '../../db/repository';
import { qualityBand } from '../../engine/quality';
import { exportMeasurements, type ExportFormat } from '../../export/exporter';
import { boundsAround } from '../../geo/heatmap';
import { getLocation } from '../../geo/location';
import { isFilterActive, useHistoryStore } from '../../store/historyStore';
import {
  NETWORK_LABELS,
  type Measurement,
  type NetworkKind,
} from '../../types';
import { Button, Chip, EmptyState } from '../components/common';
import {
  formatDateTime,
  formatValue,
  parseDateInput,
  plural,
  toDateInput,
} from '../format';
import { colors, radius, spacing } from '../theme';

const FILTER_KINDS: NetworkKind[] = ['wifi', '5g', '4g', '3g', '2g', 'none'];
const NEARBY_RADIUS_M = 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

function startOfToday(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function Row({ item }: { item: Measurement }) {
  const band = qualityBand(item.quality);
  return (
    <View style={styles.item}>
      <View style={[styles.qualityDot, { backgroundColor: band.color }]}>
        <Text style={styles.qualityText}>{item.quality}</Text>
      </View>
      <View style={styles.flex}>
        <Text style={styles.itemTitle}>
          {NETWORK_LABELS[item.netKind]}
          {item.netDetail ? ` · ${item.netDetail}` : ''}
          {item.carrier ? ` · ${item.carrier}` : ''}
        </Text>
        <Text style={styles.itemLine}>
          RTT {formatValue(item.rttAvg, 'ms')} · jitter{' '}
          {formatValue(item.jitter, 'ms', 1)} · pérd.{' '}
          {formatValue(item.lossPct, '%')}
        </Text>
        <Text style={styles.itemLine}>
          ↓ {formatValue(item.downMbps, 'Mbps', 1)} · ↑{' '}
          {formatValue(item.upMbps, 'Mbps', 1)} · señal{' '}
          {formatValue(item.signalDbm, 'dBm')}
        </Text>
        <Text style={styles.itemMeta}>
          {formatDateTime(item.timestamp)}
          {item.source === 'background' ? ' · segundo plano' : ''}
          {item.latitude === null ? ' · sin ubicación' : ''}
        </Text>
      </View>
    </View>
  );
}

export function HistoryScreen() {
  const insets = useSafeAreaInsets();
  const measurements = useHistoryStore(s => s.measurements);
  const filter = useHistoryStore(s => s.filter);
  const setFilter = useHistoryStore(s => s.setFilter);
  const resetFilter = useHistoryStore(s => s.resetFilter);
  const clearAll = useHistoryStore(s => s.clearAll);

  const [fromText, setFromText] = useState(toDateInput(filter.from));
  const [toText, setToText] = useState(toDateInput(filter.to));
  const [dateError, setDateError] = useState<string | null>(null);

  // Los campos de texto siguen al filtro cuando cambia por otro camino
  // (atajos de fecha, "Limpiar filtros").
  useEffect(() => {
    setFromText(toDateInput(filter.from));
    setToText(toDateInput(filter.to));
  }, [filter.from, filter.to]);

  const toggleKind = (kind: NetworkKind) => {
    const kinds = filter.kinds.includes(kind)
      ? filter.kinds.filter(k => k !== kind)
      : [...filter.kinds, kind];
    setFilter({ kinds });
  };

  const applyDates = () => {
    const from = parseDateInput(fromText);
    const to = parseDateInput(toText, true);
    if (from === undefined || to === undefined) {
      setDateError('Usá el formato AAAA-MM-DD (por ejemplo 2026-10-07)');
      return;
    }
    if (from !== null && to !== null && from > to) {
      setDateError('"Desde" no puede ser posterior a "Hasta"');
      return;
    }
    setDateError(null);
    setFilter({ from, to });
  };

  const applyPreset = (days: number | null) => {
    setDateError(null);
    setFilter({
      from: days === null ? null : startOfToday() - (days - 1) * DAY_MS,
      to: null,
    });
  };

  const filterNearby = async () => {
    const fix = await getLocation();
    if (!fix) {
      Alert.alert(
        'Ubicación no disponible',
        'No se pudo obtener tu ubicación para filtrar por cercanía.',
      );
      return;
    }
    setFilter({
      bounds: boundsAround(fix.latitude, fix.longitude, NEARBY_RADIUS_M),
    });
  };

  const runExport = async (format: ExportFormat) => {
    try {
      // Se exporta todo lo que cumple el filtro, no solo las filas cargadas
      // en la lista (que tiene un tope).
      await exportMeasurements(await queryMeasurements(filter), format);
    } catch (error) {
      Alert.alert('No se pudo exportar', (error as Error).message);
    }
  };

  const confirmClear = () => {
    Alert.alert(
      'Borrar historial',
      'Se van a eliminar todas las mediciones y sesiones guardadas. Esta acción no se puede deshacer.',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Borrar todo', style: 'destructive', onPress: clearAll },
      ],
    );
  };

  const header = (
    <View>
      <Text style={styles.title}>Historial</Text>

      <Text style={styles.label}>Tipo de red</Text>
      <View style={styles.wrap}>
        {FILTER_KINDS.map(kind => (
          <Chip
            key={kind}
            label={NETWORK_LABELS[kind]}
            selected={filter.kinds.includes(kind)}
            onPress={() => toggleKind(kind)}
          />
        ))}
      </View>

      <Text style={styles.label}>Rango de fechas</Text>
      <View style={styles.wrap}>
        <Chip label="Hoy" selected={false} onPress={() => applyPreset(1)} />
        <Chip label="7 días" selected={false} onPress={() => applyPreset(7)} />
        <Chip label="30 días" selected={false} onPress={() => applyPreset(30)} />
        <Chip
          label="Todo"
          selected={filter.from === null && filter.to === null}
          onPress={() => applyPreset(null)}
        />
      </View>
      <View style={styles.row}>
        <TextInput
          style={[styles.input, styles.flex]}
          value={fromText}
          onChangeText={setFromText}
          onEndEditing={applyDates}
          placeholder="Desde AAAA-MM-DD"
          placeholderTextColor={colors.textMuted}
          keyboardType="numbers-and-punctuation"
          accessibilityLabel="Fecha desde"
        />
        <View style={styles.gap} />
        <TextInput
          style={[styles.input, styles.flex]}
          value={toText}
          onChangeText={setToText}
          onEndEditing={applyDates}
          placeholder="Hasta AAAA-MM-DD"
          placeholderTextColor={colors.textMuted}
          keyboardType="numbers-and-punctuation"
          accessibilityLabel="Fecha hasta"
        />
      </View>
      {dateError ? <Text style={styles.error}>{dateError}</Text> : null}

      <Text style={styles.label}>Zona geográfica</Text>
      <View style={styles.wrap}>
        <Chip
          label="Cerca de mí (1 km)"
          selected={false}
          onPress={filterNearby}
        />
        {filter.bounds ? (
          <Chip
            label="Zona activa ✕"
            selected
            onPress={() => setFilter({ bounds: null })}
          />
        ) : null}
      </View>
      <Text style={styles.hint}>
        También podés filtrar por la zona visible desde la pestaña Mapa.
      </Text>

      <View style={[styles.row, styles.actions]}>
        <Button
          label="Exportar CSV"
          variant="secondary"
          onPress={() => runExport('csv')}
          disabled={measurements.length === 0}
          style={styles.flex}
        />
        <View style={styles.gap} />
        <Button
          label="Exportar JSON"
          variant="secondary"
          onPress={() => runExport('json')}
          disabled={measurements.length === 0}
          style={styles.flex}
        />
      </View>

      <View style={[styles.row, styles.summary]}>
        <Text style={styles.count}>
          {plural(measurements.length, 'medición', 'mediciones')}
        </Text>
        {isFilterActive(filter) ? (
          <Text style={styles.link} onPress={resetFilter}>
            Limpiar filtros
          </Text>
        ) : null}
      </View>
    </View>
  );

  return (
    <FlatList
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.lg }]}
      data={measurements}
      keyExtractor={item => item.id}
      renderItem={({ item }) => <Row item={item} />}
      ListHeaderComponent={header}
      ListEmptyComponent={
        <EmptyState
          title={
            isFilterActive(filter)
              ? 'Ninguna medición coincide con los filtros'
              : 'Todavía no hay mediciones'
          }
          hint={
            isFilterActive(filter)
              ? 'Probá ampliar el rango de fechas o quitar algún filtro.'
              : 'Las mediciones que hagas desde la pestaña Monitor van a aparecer acá.'
          }
        />
      }
      ListFooterComponent={
        measurements.length > 0 ? (
          <Button
            label="Borrar todo el historial"
            variant="danger"
            onPress={confirmClear}
            style={styles.clear}
          />
        ) : undefined
      }
      keyboardShouldPersistTaps="handled"
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xl },
  title: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '800',
    marginBottom: spacing.md,
  },
  label: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  wrap: { flexDirection: 'row', flexWrap: 'wrap' },
  row: { flexDirection: 'row', alignItems: 'center' },
  flex: { flex: 1 },
  gap: { width: spacing.sm },
  input: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    color: colors.text,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 14,
  },
  error: { color: colors.danger, fontSize: 12, marginTop: spacing.xs },
  hint: { color: colors.textMuted, fontSize: 12 },
  actions: { marginTop: spacing.lg },
  summary: {
    justifyContent: 'space-between',
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  count: { color: colors.text, fontSize: 14, fontWeight: '700' },
  link: { color: colors.primary, fontSize: 14, fontWeight: '600' },
  item: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  qualityDot: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  qualityText: { color: '#0b1220', fontSize: 14, fontWeight: '800' },
  itemTitle: { color: colors.text, fontSize: 14, fontWeight: '700' },
  itemLine: { color: colors.text, fontSize: 13, marginTop: 2 },
  itemMeta: { color: colors.textMuted, fontSize: 12, marginTop: 4 },
  clear: { marginTop: spacing.lg },
});
