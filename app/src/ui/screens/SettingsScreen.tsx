import { useEffect, useState } from 'react';
import {
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { newId } from '../../db/repository';
import { checkBackend } from '../../engine/throughput';
import {
  checkPermissions,
  requestBackgroundLocation,
  requestForegroundPermissions,
  type PermissionStatus,
} from '../../permissions';
import { MIN_HOSTS } from '../../settings';
import { useSettingsStore } from '../../store/settingsStore';
import type { Settings } from '../../types';
import { Button, Card } from '../components/common';
import { colors, radius, spacing } from '../theme';

/** Copia editable de los ajustes: los números se editan como texto. */
interface Draft {
  hosts: { id: string; label: string; host: string; port: string }[];
  backendUrl: string;
  pingCount: string;
  pingTimeoutMs: string;
  sampleIntervalSec: string;
  sessionThroughput: boolean;
  downloadMb: string;
  uploadMb: string;
  backgroundEnabled: boolean;
  backgroundIntervalMin: string;
  backgroundThroughput: boolean;
  notifyEnabled: boolean;
  maxRttMs: string;
  maxLossPct: string;
  minDownMbps: string;
}

function toDraft(settings: Settings): Draft {
  return {
    hosts: settings.hosts.map(h => ({ ...h, port: String(h.port) })),
    backendUrl: settings.backendUrl,
    pingCount: String(settings.pingCount),
    pingTimeoutMs: String(settings.pingTimeoutMs),
    sampleIntervalSec: String(settings.sampleIntervalSec),
    sessionThroughput: settings.sessionThroughput,
    downloadMb: String(settings.downloadMb),
    uploadMb: String(settings.uploadMb),
    backgroundEnabled: settings.backgroundEnabled,
    backgroundIntervalMin: String(settings.backgroundIntervalMin),
    backgroundThroughput: settings.backgroundThroughput,
    notifyEnabled: settings.notifyEnabled,
    maxRttMs: String(settings.thresholds.maxRttMs),
    maxLossPct: String(settings.thresholds.maxLossPct),
    minDownMbps: String(settings.thresholds.minDownMbps),
  };
}

const NUMERIC_FIELDS: [keyof Draft, string][] = [
  ['pingCount', 'Sondas por host'],
  ['pingTimeoutMs', 'Timeout de sonda'],
  ['sampleIntervalSec', 'Intervalo de sesión'],
  ['downloadMb', 'Tamaño de descarga'],
  ['uploadMb', 'Tamaño de subida'],
  ['backgroundIntervalMin', 'Intervalo en segundo plano'],
  ['maxRttMs', 'Latencia máxima'],
  ['maxLossPct', 'Pérdida máxima'],
  ['minDownMbps', 'Descarga mínima'],
];

/** Convierte el borrador a Settings; devuelve un string con el error si algún número no es válido. */
function fromDraft(draft: Draft): Settings | string {
  const toNumber = (text: string) => Number(text.trim().replace(',', '.'));
  for (const [field, name] of NUMERIC_FIELDS) {
    const value = toNumber(draft[field] as string);
    if ((draft[field] as string).trim() === '' || !Number.isFinite(value)) {
      return `"${name}" tiene que ser un número`;
    }
  }
  return {
    hosts: draft.hosts.map(h => ({
      id: h.id,
      label: h.label.trim() || h.host.trim(),
      host: h.host.trim(),
      port: toNumber(h.port),
    })),
    backendUrl: draft.backendUrl.trim(),
    pingCount: Math.round(toNumber(draft.pingCount)),
    pingTimeoutMs: Math.round(toNumber(draft.pingTimeoutMs)),
    sampleIntervalSec: Math.round(toNumber(draft.sampleIntervalSec)),
    sessionThroughput: draft.sessionThroughput,
    downloadMb: toNumber(draft.downloadMb),
    uploadMb: toNumber(draft.uploadMb),
    backgroundEnabled: draft.backgroundEnabled,
    backgroundIntervalMin: Math.round(toNumber(draft.backgroundIntervalMin)),
    backgroundThroughput: draft.backgroundThroughput,
    notifyEnabled: draft.notifyEnabled,
    thresholds: {
      maxRttMs: toNumber(draft.maxRttMs),
      maxLossPct: toNumber(draft.maxLossPct),
      minDownMbps: toNumber(draft.minDownMbps),
    },
  };
}

function Field({
  label,
  value,
  onChangeText,
  numeric = false,
  placeholder,
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  numeric?: boolean;
  placeholder?: string;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        keyboardType={numeric ? 'numeric' : 'default'}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        accessibilityLabel={label}
      />
    </View>
  );
}

function Toggle({
  label,
  hint,
  value,
  onValueChange,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
}) {
  return (
    <View style={styles.toggle}>
      <View style={styles.flex}>
        <Text style={styles.toggleLabel}>{label}</Text>
        {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        accessibilityLabel={label}
        trackColor={{ true: colors.primary, false: colors.border }}
      />
    </View>
  );
}

function PermissionRow({ label, granted }: { label: string; granted: boolean }) {
  return (
    <View style={styles.permission}>
      <Text style={styles.toggleLabel}>{label}</Text>
      <Text style={{ color: granted ? colors.success : colors.warning }}>
        {granted ? 'Concedido' : 'Pendiente'}
      </Text>
    </View>
  );
}

export function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const settings = useSettingsStore(s => s.settings);
  const save = useSettingsStore(s => s.save);
  const [draft, setDraft] = useState<Draft>(() => toDraft(settings));
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [backendStatus, setBackendStatus] = useState<string | null>(null);
  const [permissions, setPermissions] = useState<PermissionStatus | null>(null);

  // Si los ajustes cambian fuera de esta pantalla (carga inicial), se
  // descarta el borrador.
  useEffect(() => {
    setDraft(toDraft(settings));
  }, [settings]);

  useEffect(() => {
    checkPermissions().then(setPermissions);
  }, []);

  const patch = (changes: Partial<Draft>) => {
    setMessage(null);
    setDraft(current => ({ ...current, ...changes }));
  };

  const patchHost = (id: string, changes: Partial<Draft['hosts'][number]>) =>
    patch({
      hosts: draft.hosts.map(h => (h.id === id ? { ...h, ...changes } : h)),
    });

  const onSave = async () => {
    const parsed = fromDraft(draft);
    if (typeof parsed === 'string') {
      setMessage({ text: parsed, ok: false });
      return;
    }
    const error = await save(parsed);
    setMessage(
      error ? { text: error, ok: false } : { text: 'Ajustes guardados', ok: true },
    );
    if (!error && parsed.backgroundEnabled && permissions && !permissions.backgroundLocation) {
      Alert.alert(
        'Ubicación en segundo plano',
        'Sin el permiso "Permitir todo el tiempo", las muestras en segundo plano se guardan con la última ubicación conocida o sin coordenadas.',
      );
    }
  };

  const testBackend = async () => {
    setBackendStatus('Probando…');
    const ok = await checkBackend(draft.backendUrl);
    setBackendStatus(
      ok ? 'El backend responde correctamente' : 'No se pudo conectar con el backend',
    );
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.lg }]}
      keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>Ajustes</Text>

      <Card title="Hosts de latencia">
        <Text style={styles.hint}>
          Cada sonda mide el handshake TCP contra host:puerto. Mínimo {MIN_HOSTS}{' '}
          hosts.
        </Text>
        {draft.hosts.map(host => (
          <View key={host.id} style={styles.hostBlock}>
            <Field
              label="Nombre"
              value={host.label}
              onChangeText={label => patchHost(host.id, { label })}
            />
            <View style={styles.row}>
              <View style={styles.hostField}>
                <Field
                  label="Host o IP"
                  value={host.host}
                  onChangeText={value => patchHost(host.id, { host: value })}
                  placeholder="ejemplo.com"
                />
              </View>
              <View style={styles.gap} />
              <View style={styles.portField}>
                <Field
                  label="Puerto"
                  value={host.port}
                  onChangeText={port => patchHost(host.id, { port })}
                  numeric
                />
              </View>
            </View>
            {draft.hosts.length > MIN_HOSTS ? (
              <Text
                style={styles.remove}
                accessibilityRole="button"
                onPress={() =>
                  patch({ hosts: draft.hosts.filter(h => h.id !== host.id) })
                }>
                Quitar host
              </Text>
            ) : null}
          </View>
        ))}
        <Button
          label="Agregar host"
          variant="secondary"
          onPress={() =>
            patch({
              hosts: [
                ...draft.hosts,
                { id: newId(), label: '', host: '', port: '443' },
              ],
            })
          }
        />
        <View style={styles.row}>
          <View style={styles.flex}>
            <Field
              label="Sondas por host"
              value={draft.pingCount}
              onChangeText={pingCount => patch({ pingCount })}
              numeric
            />
          </View>
          <View style={styles.gap} />
          <View style={styles.flex}>
            <Field
              label="Timeout (ms)"
              value={draft.pingTimeoutMs}
              onChangeText={pingTimeoutMs => patch({ pingTimeoutMs })}
              numeric
            />
          </View>
        </View>
      </Card>

      <Card title="Test de throughput">
        <Field
          label="URL del backend de referencia"
          value={draft.backendUrl}
          onChangeText={backendUrl => patch({ backendUrl })}
          placeholder="http://192.168.0.10:3000"
        />
        <Text style={styles.hint}>
          En el emulador de Android, 10.0.2.2 apunta a tu máquina. En un
          dispositivo físico usá la IP de la máquina en la red local.
        </Text>
        <Button
          label="Probar conexión"
          variant="secondary"
          onPress={testBackend}
          style={styles.spaced}
        />
        {backendStatus ? <Text style={styles.hint}>{backendStatus}</Text> : null}
        <View style={styles.row}>
          <View style={styles.flex}>
            <Field
              label="Descarga (MB)"
              value={draft.downloadMb}
              onChangeText={downloadMb => patch({ downloadMb })}
              numeric
            />
          </View>
          <View style={styles.gap} />
          <View style={styles.flex}>
            <Field
              label="Subida (MB)"
              value={draft.uploadMb}
              onChangeText={uploadMb => patch({ uploadMb })}
              numeric
            />
          </View>
        </View>
      </Card>

      <Card title="Sesión de monitoreo">
        <Field
          label="Intervalo entre muestras (segundos)"
          value={draft.sampleIntervalSec}
          onChangeText={sampleIntervalSec => patch({ sampleIntervalSec })}
          numeric
        />
        <Toggle
          label="Incluir throughput en cada muestra"
          hint="Consume datos: cada muestra descarga y sube los tamaños configurados."
          value={draft.sessionThroughput}
          onValueChange={sessionThroughput => patch({ sessionThroughput })}
        />
      </Card>

      <Card title="Segundo plano">
        <Toggle
          label="Muestreo periódico en segundo plano"
          hint="Sigue midiendo con la app cerrada o el dispositivo bloqueado."
          value={draft.backgroundEnabled}
          onValueChange={backgroundEnabled => patch({ backgroundEnabled })}
        />
        <Field
          label="Intervalo (minutos, mínimo 15)"
          value={draft.backgroundIntervalMin}
          onChangeText={backgroundIntervalMin => patch({ backgroundIntervalMin })}
          numeric
        />
        <Toggle
          label="Incluir throughput en segundo plano"
          hint="Desactivado por defecto: consume datos y el sistema da ~30 s por tarea."
          value={draft.backgroundThroughput}
          onValueChange={backgroundThroughput => patch({ backgroundThroughput })}
        />
      </Card>

      <Card title="Alertas de degradación">
        <Toggle
          label="Notificar degradaciones severas"
          value={draft.notifyEnabled}
          onValueChange={notifyEnabled => patch({ notifyEnabled })}
        />
        <Field
          label="Latencia máxima (ms)"
          value={draft.maxRttMs}
          onChangeText={maxRttMs => patch({ maxRttMs })}
          numeric
        />
        <Field
          label="Pérdida máxima (%)"
          value={draft.maxLossPct}
          onChangeText={maxLossPct => patch({ maxLossPct })}
          numeric
        />
        <Field
          label="Descarga mínima (Mbps)"
          value={draft.minDownMbps}
          onChangeText={minDownMbps => patch({ minDownMbps })}
          numeric
        />
      </Card>

      {message ? (
        <Text
          style={[
            styles.message,
            { color: message.ok ? colors.success : colors.danger },
          ]}>
          {message.text}
        </Text>
      ) : null}
      <Button label="Guardar ajustes" onPress={onSave} />

      <Card title="Permisos" style={styles.permissionsCard}>
        {permissions ? (
          <>
            <PermissionRow label="Ubicación" granted={permissions.location} />
            <PermissionRow
              label="Estado del teléfono"
              granted={permissions.phone}
            />
            <PermissionRow
              label="Notificaciones"
              granted={permissions.notifications}
            />
            <PermissionRow
              label="Ubicación en segundo plano"
              granted={permissions.backgroundLocation}
            />
          </>
        ) : null}
        <Button
          label="Solicitar permisos"
          variant="secondary"
          onPress={async () => setPermissions(await requestForegroundPermissions())}
          style={styles.spaced}
        />
        {Platform.OS === 'android' ? (
          <Button
            label="Permitir ubicación en segundo plano"
            variant="secondary"
            onPress={async () => {
              await requestBackgroundLocation();
              setPermissions(await checkPermissions());
            }}
            style={styles.spaced}
          />
        ) : null}
      </Card>
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
  row: { flexDirection: 'row' },
  flex: { flex: 1 },
  gap: { width: spacing.sm },
  hint: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  field: { marginTop: spacing.md },
  fieldLabel: { color: colors.textMuted, fontSize: 12, marginBottom: 4 },
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
  hostBlock: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingBottom: spacing.md,
    marginBottom: spacing.sm,
  },
  hostField: { flex: 2 },
  portField: { flex: 1 },
  remove: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: '600',
    marginTop: spacing.sm,
  },
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.md,
  },
  toggleLabel: { color: colors.text, fontSize: 14 },
  spaced: { marginTop: spacing.md },
  message: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  permissionsCard: { marginTop: spacing.lg },
  permission: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
});
