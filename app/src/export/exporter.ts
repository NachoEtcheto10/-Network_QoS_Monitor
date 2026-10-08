import Share from 'react-native-share';
import type { Measurement } from '../types';
import { toBase64, toCsv, toJson } from './format';

export type ExportFormat = 'csv' | 'json';

const MIME: Record<ExportFormat, string> = {
  csv: 'text/csv',
  json: 'application/json',
};

/**
 * Genera el archivo de exportación y abre la hoja de compartir del sistema
 * (guardar en Archivos/Drive, enviar por mail, etc.).
 */
export async function exportMeasurements(
  measurements: Measurement[],
  format: ExportFormat,
): Promise<void> {
  const content = format === 'csv' ? toCsv(measurements) : toJson(measurements);
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');

  await Share.open({
    title: 'Exportar mediciones',
    url: `data:${MIME[format]};base64,${toBase64(content)}`,
    type: MIME[format],
    filename: `qos-mediciones-${stamp}`,
    // Android: sin esto la librería escribe el archivo en la caché externa,
    // que su FileProvider no expone, y el compartir falla.
    useInternalStorage: true,
    failOnCancel: false,
  });
}
