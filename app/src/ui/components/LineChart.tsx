import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';
import { formatTime } from '../format';
import { colors, spacing } from '../theme';

export interface ChartPoint {
  /** Timestamp en ms. */
  x: number;
  /** null = no medido: corta la línea en ese punto. */
  y: number | null;
}

export interface ChartSeries {
  label: string;
  color: string;
  points: ChartPoint[];
}

const PADDING = { top: 12, right: 12, bottom: 24, left: 44 };
const Y_TICKS = 4;

/** Redondea hacia arriba a un número "lindo" (1, 2, 5 x 10^n) para el eje Y. */
export function niceCeil(value: number): number {
  if (value <= 0) {
    return 1;
  }
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;
  const nice = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return nice * magnitude;
}

/**
 * Path SVG de una serie; los valores null parten la línea en tramos.
 */
export function buildPath(
  points: ChartPoint[],
  scaleX: (x: number) => number,
  scaleY: (y: number) => number,
): string {
  let path = '';
  let penDown = false;
  for (const point of points) {
    if (point.y === null) {
      penDown = false;
      continue;
    }
    path += `${penDown ? 'L' : 'M'}${scaleX(point.x).toFixed(1)},${scaleY(point.y).toFixed(1)} `;
    penDown = true;
  }
  return path.trim();
}

/** Gráfico de líneas para series temporales (eje X = hora de la medición). */
export function LineChart({
  series,
  unit,
  height = 200,
}: {
  series: ChartSeries[];
  unit: string;
  height?: number;
}) {
  const [width, setWidth] = useState(0);

  const all = series.flatMap(s => s.points);
  const values = all.map(p => p.y).filter((y): y is number => y !== null);
  const hasData = values.length > 0;

  const minX = all.length > 0 ? Math.min(...all.map(p => p.x)) : 0;
  const maxX = all.length > 0 ? Math.max(...all.map(p => p.x)) : 1;
  const maxY = niceCeil(hasData ? Math.max(...values) : 1);

  const plotWidth = Math.max(0, width - PADDING.left - PADDING.right);
  const plotHeight = height - PADDING.top - PADDING.bottom;
  const spanX = maxX - minX;
  // Con un solo punto (o todos en el mismo instante) se centra en el eje X.
  const scaleX = (x: number) =>
    PADDING.left + (spanX === 0 ? plotWidth / 2 : ((x - minX) / spanX) * plotWidth);
  const scaleY = (y: number) =>
    PADDING.top + plotHeight - (y / maxY) * plotHeight;

  const ticks = Array.from({ length: Y_TICKS + 1 }, (_, i) => (maxY / Y_TICKS) * i);

  return (
    <View>
      <View
        style={{ height }}
        onLayout={event => setWidth(event.nativeEvent.layout.width)}>
        {width > 0 ? (
          <Svg width={width} height={height}>
            {ticks.map(tick => (
              <Line
                key={`grid-${tick}`}
                x1={PADDING.left}
                x2={width - PADDING.right}
                y1={scaleY(tick)}
                y2={scaleY(tick)}
                stroke={colors.border}
                strokeWidth={1}
              />
            ))}
            {ticks.map(tick => (
              <SvgText
                key={`label-${tick}`}
                x={PADDING.left - 6}
                y={scaleY(tick) + 4}
                fill={colors.textMuted}
                fontSize={10}
                textAnchor="end">
                {tick >= 100 ? tick.toFixed(0) : Number(tick.toFixed(1))}
              </SvgText>
            ))}
            {hasData ? (
              <>
                <SvgText
                  x={PADDING.left}
                  y={height - 6}
                  fill={colors.textMuted}
                  fontSize={10}
                  textAnchor="start">
                  {formatTime(minX)}
                </SvgText>
                {spanX > 0 ? (
                  <SvgText
                    x={width - PADDING.right}
                    y={height - 6}
                    fill={colors.textMuted}
                    fontSize={10}
                    textAnchor="end">
                    {formatTime(maxX)}
                  </SvgText>
                ) : null}
              </>
            ) : null}
            {series.map(s => (
              <Path
                key={`line-${s.label}`}
                d={buildPath(s.points, scaleX, scaleY)}
                stroke={s.color}
                strokeWidth={2}
                fill="none"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            ))}
            {series.map(s =>
              // Los puntos se dibujan solo en series cortas; en las largas
              // tapan la línea. Un punto aislado no forma tramo, así que
              // siempre se marca.
              s.points.length <= 60
                ? s.points.map(point =>
                    point.y !== null ? (
                      <Circle
                        key={`dot-${s.label}-${point.x}`}
                        cx={scaleX(point.x)}
                        cy={scaleY(point.y)}
                        r={3}
                        fill={s.color}
                      />
                    ) : null,
                  )
                : null,
            )}
          </Svg>
        ) : null}
        {!hasData ? (
          <View style={styles.noData} pointerEvents="none">
            <Text style={styles.noDataText}>Sin datos en esta sesión</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.legend}>
        {series.map(s => (
          <View key={s.label} style={styles.legendItem}>
            <View style={[styles.swatch, { backgroundColor: s.color }]} />
            <Text style={styles.legendLabel}>
              {s.label} ({unit})
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  noData: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noDataText: {
    color: colors.textMuted,
    fontSize: 13,
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: spacing.sm,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: spacing.lg,
  },
  swatch: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 6,
  },
  legendLabel: {
    color: colors.textMuted,
    fontSize: 12,
  },
});
