import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildApp, MAX_DOWNLOAD_BYTES } from '../src/app.js';

test('GET /health responde ok', async () => {
  const app = buildApp();
  const response = await app.inject({ method: 'GET', url: '/health' });
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().status, 'ok');
  await app.close();
});

test('GET /download devuelve exactamente los bytes pedidos', async () => {
  const app = buildApp();
  const bytes = 200_000;
  const response = await app.inject({ method: 'GET', url: `/download?bytes=${bytes}` });
  assert.equal(response.statusCode, 200);
  assert.equal(response.rawPayload.length, bytes);
  assert.equal(response.headers['content-length'], String(bytes));
  assert.match(response.headers['cache-control'], /no-store/);
  await app.close();
});

test('GET /download rechaza tamaños inválidos', async () => {
  const app = buildApp();
  for (const bad of ['0', '-5', 'abc', '1.5', String(MAX_DOWNLOAD_BYTES + 1)]) {
    const response = await app.inject({ method: 'GET', url: `/download?bytes=${bad}` });
    assert.equal(response.statusCode, 400, `bytes=${bad}`);
  }
  await app.close();
});

test('POST /upload cuenta los bytes recibidos', async () => {
  const app = buildApp();
  const payload = Buffer.alloc(300_000, 'a');
  const response = await app.inject({
    method: 'POST',
    url: '/upload',
    headers: { 'content-type': 'application/octet-stream' },
    payload,
  });
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().receivedBytes, payload.length);
  await app.close();
});

test('POST /upload acepta text/plain (lo que envía el cliente móvil)', async () => {
  const app = buildApp();
  const payload = 'x'.repeat(50_000);
  const response = await app.inject({
    method: 'POST',
    url: '/upload',
    headers: { 'content-type': 'text/plain' },
    payload,
  });
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().receivedBytes, payload.length);
  await app.close();
});
