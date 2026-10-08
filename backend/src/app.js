import { randomBytes } from 'node:crypto';
import { Readable } from 'node:stream';
import Fastify from 'fastify';

const MB = 1024 * 1024;
const CHUNK_SIZE = 64 * 1024;

export const DEFAULT_DOWNLOAD_BYTES = 5 * MB;
export const MAX_DOWNLOAD_BYTES = 100 * MB;
export const MAX_UPLOAD_BYTES = 100 * MB;

// Bloque ASCII aleatorio generado una sola vez. Se reutiliza para armar el
// payload de descarga: al ser incompresible, un proxy o la operadora no pueden
// inflar el throughput comprimiendo en tránsito, y al ser ASCII el cliente lo
// puede recibir como texto sin que cambie el tamaño en bytes.
const RANDOM_CHUNK = Buffer.from(
  randomBytes(CHUNK_SIZE).toString('base64').slice(0, CHUNK_SIZE),
  'ascii',
);

function payloadStream(totalBytes) {
  let remaining = totalBytes;
  return new Readable({
    read() {
      if (remaining <= 0) {
        this.push(null);
        return;
      }
      const size = Math.min(remaining, CHUNK_SIZE);
      remaining -= size;
      this.push(size === CHUNK_SIZE ? RANDOM_CHUNK : RANDOM_CHUNK.subarray(0, size));
    },
  });
}

function parseBytes(raw) {
  if (raw === undefined) {
    return DEFAULT_DOWNLOAD_BYTES;
  }
  const bytes = Number(raw);
  if (!Number.isInteger(bytes) || bytes < 1 || bytes > MAX_DOWNLOAD_BYTES) {
    return null;
  }
  return bytes;
}

export function buildApp(options = {}) {
  const app = Fastify({ bodyLimit: MAX_UPLOAD_BYTES, ...options });

  // Las respuestas no deben cachearse ni transformarse: cada test tiene que
  // mover los bytes de verdad.
  app.addHook('onSend', async (_request, reply) => {
    reply.header('Cache-Control', 'no-store, no-transform');
    reply.header('Access-Control-Allow-Origin', '*');
  });

  // El cuerpo de /upload se descarta a medida que llega (no se bufferea),
  // solo se cuentan los bytes recibidos. Se quitan los parsers por defecto
  // (JSON y text/plain) para que cualquier Content-Type pase por el contador.
  app.removeAllContentTypeParsers();
  app.addContentTypeParser('*', (_request, payload, done) => {
    let received = 0;
    payload.on('data', chunk => {
      received += chunk.length;
    });
    payload.on('end', () => done(null, { received }));
    payload.on('error', done);
  });

  app.get('/health', async () => ({ status: 'ok', time: Date.now() }));

  // Respuesta mínima: sirve como destino liviano para sondas de latencia.
  app.get('/ping', async () => ({ pong: Date.now() }));

  app.get('/download', async (request, reply) => {
    const bytes = parseBytes(request.query.bytes);
    if (bytes === null) {
      return reply.code(400).send({
        error: `bytes debe ser un entero entre 1 y ${MAX_DOWNLOAD_BYTES}`,
      });
    }
    reply
      .header('Content-Type', 'application/octet-stream')
      .header('Content-Length', bytes)
      .header('Content-Encoding', 'identity');
    return reply.send(payloadStream(bytes));
  });

  app.post('/upload', async request => {
    const received = request.body?.received ?? 0;
    return { receivedBytes: received, time: Date.now() };
  });

  return app;
}
