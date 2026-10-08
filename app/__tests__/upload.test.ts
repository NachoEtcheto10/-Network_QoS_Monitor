import { parseBackendUrl, parseUploadResponse } from '../src/engine/upload';

jest.mock('react-native-tcp-socket', () => ({}));

describe('parseBackendUrl', () => {
  it('extrae host, puerto y esquema', () => {
    expect(parseBackendUrl('http://10.0.2.2:3000')).toEqual({
      https: false,
      host: '10.0.2.2',
      port: 3000,
      basePath: '',
    });
  });

  it('usa el puerto por defecto de cada esquema', () => {
    expect(parseBackendUrl('http://qos.ejemplo.com')?.port).toBe(80);
    expect(parseBackendUrl('https://qos.ejemplo.com')).toMatchObject({
      https: true,
      port: 443,
    });
  });

  it('conserva un prefijo de ruta sin la barra final', () => {
    expect(parseBackendUrl('https://ejemplo.com/qos/')?.basePath).toBe('/qos');
    expect(parseBackendUrl(' http://ejemplo.com/ ')?.basePath).toBe('');
  });

  it('rechaza lo que no es una URL http(s) con host', () => {
    for (const bad of ['10.0.2.2:3000', 'ftp://ejemplo.com', 'http://', 'http://a:99999']) {
      expect(parseBackendUrl(bad)).toBeNull();
    }
  });
});

describe('parseUploadResponse', () => {
  const ok =
    'HTTP/1.1 200 OK\r\ncontent-type: application/json\r\ncontent-length: 44\r\n\r\n' +
    '{"receivedBytes":1048576,"time":1791420425254}';

  it('lee el estado y los bytes confirmados', () => {
    expect(parseUploadResponse(ok)).toEqual({ status: 200, receivedBytes: 1048576 });
  });

  it('espera más datos si la respuesta llegó partida', () => {
    expect(parseUploadResponse('HTTP/1.1 200 OK\r\ncontent-ty')).toBeNull();
    expect(parseUploadResponse(ok.slice(0, ok.indexOf('{')))).toBeNull();
    expect(parseUploadResponse('')).toBeNull();
  });

  it('informa los errores del servidor sin exigir cuerpo JSON', () => {
    expect(
      parseUploadResponse('HTTP/1.1 413 Payload Too Large\r\n\r\n{"error":"x"}'),
    ).toEqual({ status: 413, receivedBytes: null });
  });
});
