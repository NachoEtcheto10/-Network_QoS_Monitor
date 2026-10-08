# Network QoS Monitor

Analizador y visualizador de calidad de red móvil en tiempo real, con mapa de cobertura personal.
Trabajo práctico 5 de Desarrollo de Aplicaciones Móviles (Licenciatura en Sistemas de Información, FCyT, 2026).

La app mide la conexión del dispositivo (tipo de red, operador, señal, latencia, jitter, pérdida y throughput), georreferencia cada medición, la guarda en una base local y la muestra en un mapa de calor, en gráficos por sesión y en un historial filtrable y exportable. También puede seguir muestreando en segundo plano y avisar cuando la calidad se degrada.

```
Network_QoS_Monitor/
├── app/                 Aplicación React Native (CLI, Nueva Arquitectura)
│   ├── specs/           Especificación del TurboModule de telefonía (codegen)
│   ├── src/             Código TypeScript (motor, persistencia, geo, UI)
│   ├── android/         Proyecto Android + módulo nativo en Kotlin
│   ├── ios/             Proyecto iOS + módulo nativo en Swift/ObjC++
│   └── __tests__/       Tests unitarios (Jest)
├── backend/             Backend de referencia para el test de throughput (Fastify)
└── docker-compose.yml   Levanta el backend en un contenedor
```

## Puesta en marcha

### Requisitos

- Node.js 22.11 o superior.
- JDK 17 y Android SDK (plataforma 37, build-tools 37.0.0, NDK 27.1; Gradle descarga lo que falte).
- Para iOS: macOS con Xcode y CocoaPods.
- Una API key de Google Maps con "Maps SDK for Android" habilitado (ver más abajo).

### 1. Backend de referencia

Con Docker, desde la raíz del repositorio:

```bash
docker compose up -d --build
```

Sin Docker:

```bash
cd backend
npm install
npm start          # escucha en 0.0.0.0:3000 (configurable con PORT y HOST)
```

Comprobación: `curl http://localhost:3000/health` debe responder `{"status":"ok",...}`.

| Endpoint | Uso |
| --- | --- |
| `GET /health` | Verificación de disponibilidad ("Probar conexión" en la app). |
| `GET /ping` | Respuesta mínima. |
| `GET /download?bytes=N` | Devuelve exactamente N bytes (1 a 100 MB, 5 MB por defecto). |
| `POST /upload` | Descarta el cuerpo a medida que llega y responde `{"receivedBytes": N}`. |

Para desplegarlo en un servidor alcanza con construir la imagen (`docker build -t qos-backend backend`) y publicarla con el puerto 3000 expuesto. El servicio no guarda estado.

### 2. API key de Google Maps (Android)

`react-native-maps` usa el SDK de Google Maps en Android, que no dibuja el mapa sin una key. Agregala en `app/android/local.properties` (el archivo no se versiona):

```properties
MAPS_API_KEY=tu_api_key
```

También se puede pasar como propiedad de Gradle (`-PMAPS_API_KEY=...`) o como variable de entorno `MAPS_API_KEY`. Sin key la app compila y funciona, pero la pestaña Mapa queda en blanco.

### 3. Aplicación

```bash
cd app
npm install
npm run android      # con un emulador abierto o un dispositivo conectado
```

En iOS: `cd ios && bundle install && bundle exec pod install`, y después `npm run ios`.

APK instalable sin Metro (firmado con la keystore de debug):

```bash
cd app/android
./gradlew assembleRelease
# app/android/app/build/outputs/apk/release/app-release.apk
```

### 4. Apuntar la app al backend

En **Ajustes → Test de throughput** se configura la URL del backend:

- Emulador de Android: `http://10.0.2.2:3000` (valor por defecto; `10.0.2.2` es la máquina anfitriona).
- Dispositivo físico: `http://<IP de la máquina en la LAN>:3000`, con el teléfono en la misma red, o la URL pública del servidor donde esté desplegado.

"Probar conexión" verifica que el backend responda antes de medir.

## Requisitos funcionales

| ID | Requisito | Dónde está |
| --- | --- | --- |
| RF-01 | Tipo de red activa y operador | Pestaña Monitor. `src/engine/network.ts` fusiona NetInfo con el módulo nativo. |
| RF-02 | RTT contra 3 o más hosts configurables, con min/avg/max/jitter | Tabla "Latencia por host". Hosts editables en Ajustes (mínimo 3). `src/engine/ping.ts`, `src/engine/stats.ts`. |
| RF-03 | Test de descarga y subida en Mbps | Tarjeta "Throughput". `src/engine/throughput.ts` contra `backend/`. |
| RF-04 | Medición con timestamp y coordenadas GPS | `src/engine/measure.ts`, `src/geo/location.ts`. |
| RF-05 | Mapa con heatmap de señal/calidad | Pestaña Mapa: métrica (calidad, señal o latencia) y capa (heatmap, celdas o puntos). |
| RF-06 | Series temporales de latencia y throughput por sesión | Pestaña Gráficos. |
| RF-07 | Mediciones periódicas en background y notificación de degradaciones | `src/engine/background.ts`, `src/engine/notifications.ts`. Se activa en Ajustes. |
| RF-08 | Exportación a CSV/JSON | Pestaña Historial, botones de exportación. `src/export/`. |
| RF-09 | Filtros por tipo de red, fechas y zona | Pestaña Historial; el filtro de zona también se aplica desde el Mapa ("Filtrar zona visible"). |

## Arquitectura

La app sigue las capas propuestas en el enunciado. Cada una depende solo de las que tiene debajo.

| Capa | Responsabilidad | Código |
| --- | --- | --- |
| Native Bridge | RSSI/RSRP, tecnología de radio y operador | `specs/NativeTelephony.ts`, `android/.../telephony/`, `ios/NetworkQoSMonitor/Telephony/` |
| Measurement Engine | Sondas, throughput, puntaje de calidad, muestreo periódico | `src/engine/` |
| Persistence Layer | Mediciones, sesiones y ajustes en SQLite | `src/db/` |
| Geo Layer | Ubicación con caché, grilla del heatmap | `src/geo/` |
| Presentation Layer | Pantallas, gráficos y store reactivo | `src/ui/`, `src/store/` |
| Backend | Endpoints del test de throughput | `backend/` |

Flujo de una medición (`runMeasurement` en `src/engine/measure.ts`):

1. Lee el estado de la red (NetInfo + módulo nativo).
2. Obtiene la ubicación.
3. Sondea los hosts configurados.
4. Si corresponde, corre el test de descarga y subida.
5. Calcula el puntaje de calidad y guarda la medición en SQLite.
6. Si se superó algún umbral, emite una notificación.

`runMeasurement` no depende de React ni del store: recibe la configuración y publica su avance por callbacks. Por eso la usan tanto la UI (a través de `monitorStore`) como la tarea headless de background, que corre en un contexto JavaScript propio y sin interfaz.

### Módulo nativo de telefonía

`NativeTelephony` es un TurboModule definido en `specs/NativeTelephony.ts`; el codegen de React Native genera las interfaces nativas a partir de ese archivo. Expone un único método, `getTelephonyInfo()`.

- **Android (Kotlin):** `TelephonyManager` para operador, MCC/MNC y `dataNetworkType`; `SignalStrength.cellSignalStrengths` para dBm, nivel, RSRP, RSRQ y SINR; `WifiManager` para el RSSI de WiFi. Detecta 5G NSA (el sistema informa LTE, pero hay una portadora NR con señal válida).
- **iOS (Swift + adaptador ObjC++):** `CTTelephonyNetworkInfo` para la tecnología de radio y el operador.

NetInfo decide qué transporte está activo (WiFi o celular) y el módulo nativo aporta el detalle. Si el módulo no está disponible o falta el permiso, la app sigue funcionando con la generación celular que informa NetInfo.

### Modelo de datos

SQLite (`op-sqlite`), con migraciones versionadas por `PRAGMA user_version`:

- `sessions`: una fila por sesión. Hay tres tipos: `monitor` (monitoreo continuo iniciado por el usuario), `single` (mediciones sueltas del día) y `background` (muestras en segundo plano del día).
- `measurements`: una fila por medición, con índices por fecha, por sesión y por coordenadas. El detalle por host se guarda como JSON.
- `settings`: pares clave-valor (ajustes, última ubicación conocida, hora de la última alerta).

## Decisiones de diseño

**Latencia por handshake TCP.** Una app sin privilegios no puede enviar ICMP. Cada sonda abre un socket TCP con `react-native-tcp-socket`, mide el tiempo hasta que se completa la conexión y lo cierra sin enviar datos. Las sondas a un mismo host son secuenciales, para que el jitter refleje la variación entre paquetes consecutivos, y los hosts se sondean en paralelo, para acotar la duración de la muestra.

**Jitter y pérdida.** El jitter es la media de las diferencias absolutas entre RTT consecutivos de las sondas respondidas. La pérdida es el porcentaje de sondas que no completaron la conexión dentro del timeout.

**Throughput.** Mbps = bytes transferidos × 8 / segundos / 1.000.000, sobre los bytes efectivamente transferidos y no sobre los pedidos. En la descarga el reloj arranca cuando llegan los headers de la respuesta, así el resultado no incluye el establecimiento de la conexión. En la subida el tiempo corre desde el primer byte escrito hasta que el servidor confirma la recepción, y se usa la cantidad de bytes que el servidor informa.

**Subida por socket TCP, no por `XMLHttpRequest`.** En Android, React Native envuelve todo cuerpo de subida en `ProgressRequestBody`, cuyo `FilterOutputStream` escribe de a un byte y notifica progreso por cada uno, haya o no un listener. La subida queda limitada por CPU: en el emulador, 1 MB tardaba entre 10 y 23 segundos por `XMLHttpRequest`, contra 0,25 segundos enviando lo mismo con netcat. Por eso `src/engine/upload.ts` escribe el `POST` HTTP directamente sobre un socket de `react-native-tcp-socket` (con TLS si la URL es `https`); con ese cambio el mismo megabyte llega en 0,4 segundos. El payload de descarga es aleatorio para que ningún intermediario pueda comprimirlo, y el backend envía `Cache-Control: no-store, no-transform`.

**No bloquear el hilo de JavaScript.** Los sockets, las peticiones HTTP, el GPS y SQLite trabajan en hilos nativos; JavaScript solo recibe eventos. El motor publica el avance en un store de Zustand y cada pantalla se suscribe únicamente a los campos que muestra.

**Puntaje de calidad (0 a 100).** Promedio ponderado de latencia (30 %), pérdida (20 %), descarga (20 %), jitter (10 %), subida (10 %) y señal (10 %), calculado solo sobre lo que se midió. Así una muestra de background sin throughput es comparable con una completa. Sin conexión, o si ningún host responde, el puntaje es 0.

**Heatmap por celdas.** El overlay de heatmap suma intensidades: dibujar las mediciones directamente mostraría densidad de muestras, no calidad. Por eso `src/geo/heatmap.ts` agrupa las mediciones en una grilla cuyo tamaño depende del zoom, promedia la métrica en cada celda y entrega un punto por celda. Además, el SDK de Google normaliza los colores contra la mayor intensidad presente, de modo que un mapa donde todo es malo se vería verde; para que la escala sea absoluta se agrega un punto de referencia de peso máximo fuera del área de interés. La capa "Celdas" dibuja los mismos promedios como círculos de color y es la que se usa en iOS, donde el overlay de heatmap no existe en Apple Maps.

**Sesiones.** Una sesión de monitoreo agrupa las muestras tomadas entre "Iniciar sesión" y "Detener sesión". Las mediciones sueltas y las de background se agrupan por día, para que también formen series graficables.

**Ubicación con caché.** Un fix de menos de 10 segundos se reutiliza. Si el GPS falla se usa el último fix conocido, siempre que no sea demasiado viejo (2 minutos en primer plano, 10 en segundo plano). Si no hay ubicación, la medición se guarda igual, sin coordenadas, y no aparece en el mapa.

**Alertas.** Se notifica cuando no hay conexión, cuando ningún host responde o cuando se supera un umbral configurable de latencia, pérdida o descarga mínima. Hay un intervalo mínimo de 10 minutos entre alertas.

**Gráficos propios.** Las series temporales se dibujan con un componente hecho sobre `react-native-svg` (`src/ui/components/LineChart.tsx`) en lugar de `victory-native`, cuya versión actual exige Skia y Reanimated: dos dependencias nativas pesadas para dos gráficos de líneas.

**Librerías distintas a las sugeridas.** Se usó `op-sqlite` en lugar de `react-native-sqlite-storage` y `@react-native-community/geolocation` en lugar de `react-native-geolocation-service`, porque las sugeridas no tienen soporte para la Nueva Arquitectura, que React Native 0.87 trae activada.

## Permisos

| Permiso (Android) | Para qué |
| --- | --- |
| `ACCESS_FINE_LOCATION` | Georreferenciar las mediciones. |
| `ACCESS_BACKGROUND_LOCATION` | Georreferenciar las muestras en segundo plano. Se pide aparte, desde Ajustes. |
| `READ_PHONE_STATE` | Leer el tipo de red celular. |
| `POST_NOTIFICATIONS` | Alertas de degradación (Android 13 o superior). |
| `ACCESS_NETWORK_STATE`, `ACCESS_WIFI_STATE` | Estado de la conexión y RSSI de WiFi. |

La app pide ubicación, teléfono y notificaciones al iniciar. Si se niega alguno sigue funcionando con menos datos: sin ubicación las mediciones no aparecen en el mapa, y sin el permiso de teléfono el tipo de red celular sale de NetInfo.

## Tests

```bash
cd app && npm test          # motor, heatmap, consultas, exportación y validaciones
cd app && npm run typecheck
cd backend && npm test      # endpoints del backend
```

## Limitaciones conocidas

- **iOS.** El código del módulo nativo y la configuración del proyecto están incluidos, pero el desarrollo se hizo en Windows y la versión de iOS no se compiló ni se probó. Además, la plataforma no ofrece API pública para la intensidad de señal (celular o WiFi), y desde iOS 16.4 tampoco informa el nombre del operador: en iOS esos datos quedan vacíos.
- **Latencia.** El RTT del handshake TCP se cronometra en JavaScript, así que incluye el paso del evento desde el hilo nativo: es algo mayor que un ping ICMP y sube si el hilo de JavaScript está ocupado (por ejemplo, justo después de abrir la app en un equipo lento). La pérdida mide conexiones fallidas, no paquetes individuales: TCP retransmite el SYN, y una pérdida aislada puede verse como una sonda lenta en lugar de una sonda perdida. No se implementaron sondas UDP.
- **Throughput.** El test usa una sola conexión HTTP y un payload de tamaño fijo, así que en enlaces muy rápidos el resultado queda por debajo de la capacidad real (domina el arranque lento de TCP). Conviene aumentar el tamaño del payload en Ajustes.
- **Segundo plano.** El sistema operativo decide cuándo ejecuta las tareas: el intervalo mínimo es de 15 minutos y puede estirarse por ahorro de batería. Cada tarea dispone de unos 30 segundos, por lo que el throughput está desactivado en background por defecto. Algunos fabricantes de Android detienen las tareas de apps cerradas si no se las excluye de la optimización de batería. En iOS no hay ejecución con la app cerrada por el usuario.
- **Monitoreo continuo.** Las sesiones de monitoreo usan temporizadores de JavaScript, que se pausan cuando la app pasa a segundo plano. Para muestrear con la pantalla apagada hay que usar el muestreo en segundo plano.
- **5G NSA.** Se detecta por la presencia de una portadora NR con señal válida, lo que depende de lo que informe el módem de cada dispositivo.
- **Señal en Android 9 o anterior.** Solo está disponible el nivel de 0 a 4, no los dBm.
- **Mapa.** Requiere una API key de Google Maps en Android. La capa de puntos muestra como máximo las 300 mediciones más recientes, y lista y mapa cargan hasta 3000 mediciones (la exportación no tiene ese tope).
- **Tráfico sin cifrar.** La app permite HTTP sin TLS para poder usar un backend en la red local. Para un despliegue público conviene publicar el backend detrás de HTTPS.

## Bibliografía

- React Native: Native Modules y TurboModules, documentación oficial.
- Android Developers: `android.telephony.TelephonyManager`.
- Apple Developer Documentation: framework CoreTelephony.
- RFC 2544, Benchmarking Methodology for Network Interconnect Devices.
- RFC 3550, RTP: definición de jitter entre llegadas.
