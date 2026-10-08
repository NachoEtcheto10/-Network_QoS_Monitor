import { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import MapView, {
  Circle,
  Heatmap,
  Marker,
  PROVIDER_GOOGLE,
  type Region,
} from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { qualityBand } from '../../engine/quality';
import {
  boundsOfRegion,
  buildHeatmapCells,
  cellSizeForRegion,
  METRIC_LABELS,
  regionOf,
  type HeatmapMetric,
} from '../../geo/heatmap';
import { getLastKnownLocation } from '../../geo/location';
import { useHistoryStore } from '../../store/historyStore';
import { NETWORK_LABELS } from '../../types';
import { Button, Chip } from '../components/common';
import { formatDateTime, formatValue, plural } from '../format';
import { colors, radius, spacing } from '../theme';

type Layer = 'heatmap' | 'cells' | 'points';

// El overlay de heatmap solo existe en el SDK de Google Maps (Android).
const HEATMAP_AVAILABLE = Platform.OS === 'android';
const LAYERS: { id: Layer; label: string }[] = [
  ...(HEATMAP_AVAILABLE ? [{ id: 'heatmap' as Layer, label: 'Heatmap' }] : []),
  { id: 'cells', label: 'Celdas' },
  { id: 'points', label: 'Puntos' },
];
const METRICS: HeatmapMetric[] = ['quality', 'signal', 'latency'];

/** Máximo de marcadores individuales; más que esto degrada el mapa. */
const MAX_MARKERS = 300;

// Concepción del Uruguay: vista inicial cuando no hay mediciones ni ubicación.
const FALLBACK_REGION: Region = {
  latitude: -32.4846,
  longitude: -58.2321,
  latitudeDelta: 0.05,
  longitudeDelta: 0.05,
};

const GRADIENT = {
  colors: ['#ef4444', '#f97316', '#eab308', '#84cc16', '#22c55e'],
  startPoints: [0.1, 0.3, 0.5, 0.7, 0.9],
  colorMapSize: 256,
};

// El heatmap de Google normaliza los colores contra la mayor intensidad del
// conjunto de datos: sin una referencia, un mapa donde TODO es malo se
// pintaría de verde. Este punto de peso 1 en la Antártida fija el tope de la
// escala en "calidad máxima" para que los colores sean absolutos.
const SCALE_ANCHOR = { latitude: -85, longitude: 0, weight: 1 };

export function MapScreen() {
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView>(null);
  const measurements = useHistoryStore(s => s.measurements);
  const filter = useHistoryStore(s => s.filter);
  const setFilter = useHistoryStore(s => s.setFilter);

  const [metric, setMetric] = useState<HeatmapMetric>('quality');
  const [layer, setLayer] = useState<Layer>(HEATMAP_AVAILABLE ? 'heatmap' : 'cells');
  const [region, setRegion] = useState<Region | null>(null);
  const [initialRegion, setInitialRegion] = useState<Region | null>(null);

  // La región inicial se resuelve una sola vez: mediciones existentes, si no
  // la última ubicación conocida, si no el fallback.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const fromData = regionOf(useHistoryStore.getState().measurements);
      const last = fromData ? null : await getLastKnownLocation();
      if (cancelled) {
        return;
      }
      setInitialRegion(
        fromData ??
          (last
            ? {
                latitude: last.latitude,
                longitude: last.longitude,
                latitudeDelta: 0.02,
                longitudeDelta: 0.02,
              }
            : FALLBACK_REGION),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const located = useMemo(
    () => measurements.filter(m => m.latitude !== null && m.longitude !== null),
    [measurements],
  );

  const cellMeters = cellSizeForRegion(
    (region ?? initialRegion ?? FALLBACK_REGION).latitudeDelta,
  );
  const cells = useMemo(
    () => buildHeatmapCells(located, metric, cellMeters),
    [located, metric, cellMeters],
  );
  const heatmapPoints = useMemo(
    () => [
      ...cells.map(cell => ({
        latitude: cell.latitude,
        longitude: cell.longitude,
        // Piso de 0.12 para que las celdas sin servicio se vean (en rojo)
        // en lugar de quedar transparentes.
        weight: Math.max(0.12, cell.value),
      })),
      SCALE_ANCHOR,
    ],
    [cells],
  );

  const fitToData = () => {
    const target = regionOf(located);
    if (target) {
      mapRef.current?.animateToRegion(target, 400);
    }
  };

  const zoneFilterOn = filter.bounds !== null;
  const toggleZoneFilter = () => {
    // Hasta que el usuario mueve el mapa, la zona visible es la inicial.
    const visible = region ?? initialRegion;
    if (zoneFilterOn) {
      setFilter({ bounds: null });
    } else if (visible) {
      setFilter({ bounds: boundsOfRegion(visible) });
    }
  };

  if (!initialRegion) {
    return <View style={styles.screen} />;
  }

  return (
    <View style={styles.screen}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
        initialRegion={initialRegion}
        onRegionChangeComplete={setRegion}
        showsUserLocation
        showsMyLocationButton={false}
        toolbarEnabled={false}>
        {layer === 'heatmap' && cells.length > 0 ? (
          <Heatmap
            points={heatmapPoints}
            radius={40}
            opacity={0.75}
            gradient={GRADIENT}
          />
        ) : null}
        {layer === 'cells'
          ? cells.map(cell => (
              <Circle
                key={`${cell.latitude},${cell.longitude}`}
                center={{ latitude: cell.latitude, longitude: cell.longitude }}
                radius={cellMeters / 2}
                fillColor={`${qualityBand(cell.value * 100).color}99`}
                strokeColor={qualityBand(cell.value * 100).color}
                strokeWidth={1}
              />
            ))
          : null}
        {layer === 'points'
          ? located.slice(0, MAX_MARKERS).map(m => (
              <Marker
                key={m.id}
                coordinate={{
                  latitude: m.latitude as number,
                  longitude: m.longitude as number,
                }}
                pinColor={qualityBand(m.quality).color}
                tracksViewChanges={false}
                title={`${NETWORK_LABELS[m.netKind]} · calidad ${m.quality}`}
                description={`${formatDateTime(m.timestamp)} · RTT ${formatValue(
                  m.rttAvg,
                  'ms',
                )} · ↓ ${formatValue(m.downMbps, 'Mbps', 1)} · ${formatValue(
                  m.signalDbm,
                  'dBm',
                )}`}
              />
            ))
          : null}
      </MapView>

      <View style={[styles.panel, { top: insets.top + spacing.sm }]}>
        <View style={styles.chipRow}>
          {METRICS.map(id => (
            <Chip
              key={id}
              label={METRIC_LABELS[id]}
              selected={metric === id}
              onPress={() => setMetric(id)}
            />
          ))}
        </View>
        <View style={styles.chipRow}>
          {LAYERS.map(option => (
            <Chip
              key={option.id}
              label={option.label}
              selected={layer === option.id}
              onPress={() => setLayer(option.id)}
            />
          ))}
        </View>
        <Text style={styles.count}>
          {plural(
            located.length,
            'medición georreferenciada',
            'mediciones georreferenciadas',
          )}
          {layer === 'points' && located.length > MAX_MARKERS
            ? ` (se muestran las ${MAX_MARKERS} más recientes)`
            : ''}
          {zoneFilterOn ? ' · filtro de zona activo' : ''}
        </Text>
      </View>

      <View style={styles.bottom}>
        {layer !== 'points' ? (
          <View style={styles.legend}>
            <Text style={styles.legendText}>Peor</Text>
            {GRADIENT.colors.map(color => (
              <View
                key={color}
                style={[styles.legendSwatch, { backgroundColor: color }]}
              />
            ))}
            <Text style={styles.legendText}>Mejor</Text>
          </View>
        ) : null}
        <View style={styles.actions}>
          <Button
            label="Encuadrar datos"
            variant="secondary"
            onPress={fitToData}
            disabled={located.length === 0}
            style={styles.action}
          />
          <View style={styles.gap} />
          <Button
            label={zoneFilterOn ? 'Quitar filtro de zona' : 'Filtrar zona visible'}
            variant="secondary"
            onPress={toggleZoneFilter}
            style={styles.action}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  panel: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    backgroundColor: `${colors.surface}ee`,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingTop: spacing.md,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap' },
  count: { color: colors.textMuted, fontSize: 12 },
  bottom: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    bottom: spacing.md,
  },
  legend: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: `${colors.surface}ee`,
    borderRadius: radius.sm,
    paddingVertical: 6,
    paddingHorizontal: spacing.sm,
    marginBottom: spacing.sm,
  },
  legendSwatch: { width: 18, height: 10 },
  legendText: { color: colors.text, fontSize: 11, marginHorizontal: 6 },
  actions: { flexDirection: 'row' },
  action: { flex: 1 },
  gap: { width: spacing.sm },
});
