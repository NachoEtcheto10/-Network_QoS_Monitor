import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { DarkTheme, NavigationContainer } from '@react-navigation/native';
import { useEffect } from 'react';
import { AppState, StatusBar, StyleSheet, Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { subscribeNetwork } from './src/engine/network';
import { requestForegroundPermissions } from './src/permissions';
import { useHistoryStore } from './src/store/historyStore';
import { useMonitorStore } from './src/store/monitorStore';
import { useSettingsStore } from './src/store/settingsStore';
import { ChartsScreen } from './src/ui/screens/ChartsScreen';
import { HistoryScreen } from './src/ui/screens/HistoryScreen';
import { MapScreen } from './src/ui/screens/MapScreen';
import { MonitorScreen } from './src/ui/screens/MonitorScreen';
import { SettingsScreen } from './src/ui/screens/SettingsScreen';
import { colors } from './src/ui/theme';

const Tab = createBottomTabNavigator();

/** Cada cuánto se refresca la señal mientras la app está en primer plano. */
const SIGNAL_POLL_MS = 5000;

const navigationTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: colors.background,
    card: colors.surface,
    border: colors.border,
    primary: colors.primary,
    text: colors.text,
  },
};

const TAB_ICONS: Record<string, string> = {
  Monitor: '◉',
  Mapa: '⌖',
  Gráficos: '∿',
  Historial: '☰',
  Ajustes: '⚙',
};

const styles = StyleSheet.create({
  tabIcon: { fontSize: 18 },
});

function tabIcon(routeName: string, color: string) {
  return <Text style={[styles.tabIcon, { color }]}>{TAB_ICONS[routeName]}</Text>;
}

/**
 * Arranque de la app: carga ajustes e historial, pide permisos y mantiene el
 * estado de red del store al día (eventos de NetInfo + sondeo de señal).
 */
function useBootstrap() {
  useEffect(() => {
    const { refreshNetwork, setNetwork } = useMonitorStore.getState();
    const reloadHistory = () =>
      useHistoryStore
        .getState()
        .reload()
        .catch(error => console.warn('[app] no se pudo cargar el historial', error));

    (async () => {
      await useSettingsStore
        .getState()
        .load()
        .catch(error => console.warn('[app] no se pudieron cargar los ajustes', error));
      await reloadHistory();
      // El tipo de red celular depende del permiso de teléfono: se relee la
      // red una vez resuelto el diálogo.
      await requestForegroundPermissions().catch(() => null);
      await refreshNetwork().catch(() => null);
    })();

    const unsubscribeNetwork = subscribeNetwork(setNetwork);
    const poll = setInterval(() => {
      if (AppState.currentState === 'active') {
        refreshNetwork().catch(() => null);
      }
    }, SIGNAL_POLL_MS);
    // Al volver a primer plano pueden haber llegado muestras de background.
    const appState = AppState.addEventListener('change', state => {
      if (state === 'active') {
        reloadHistory();
        refreshNetwork().catch(() => null);
      }
    });

    return () => {
      unsubscribeNetwork();
      clearInterval(poll);
      appState.remove();
    };
  }, []);
}

function App() {
  useBootstrap();

  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" />
      <NavigationContainer theme={navigationTheme}>
        <Tab.Navigator
          screenOptions={({ route }) => ({
            headerShown: false,
            tabBarActiveTintColor: colors.primary,
            tabBarInactiveTintColor: colors.textMuted,
            tabBarStyle: {
              backgroundColor: colors.surface,
              borderTopColor: colors.border,
            },
            tabBarIcon: ({ color }) => tabIcon(route.name, color),
          })}>
          <Tab.Screen name="Monitor" component={MonitorScreen} />
          <Tab.Screen name="Mapa" component={MapScreen} />
          <Tab.Screen name="Gráficos" component={ChartsScreen} />
          <Tab.Screen name="Historial" component={HistoryScreen} />
          <Tab.Screen name="Ajustes" component={SettingsScreen} />
        </Tab.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

export default App;
