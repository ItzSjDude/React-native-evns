import {subscribeRealtime} from '../subscribeRealtime';

class FakeSocket {
  static OPEN = 1;
  static instances: FakeSocket[] = [];
  readyState = 0;
  sent: string[] = [];
  close = jest.fn(() => { this.readyState = 3; this.onclose?.(); });
  send = jest.fn((frame: string) => { this.sent.push(frame); });
  onopen?: () => void;
  onclose?: () => void;
  onerror?: () => void;
  onmessage?: (event: {data: unknown}) => void;
  constructor(public url: string) { FakeSocket.instances.push(this); }
  // Test helpers that mimic the network.
  open() { this.readyState = FakeSocket.OPEN; this.onopen?.(); }
  drop() { this.readyState = 3; this.onclose?.(); }
  message(data: unknown) { this.onmessage?.({data}); }
}

const originalWebSocket = globalThis.WebSocket;
let getToken: jest.Mock;
let onEvent: jest.Mock;
let onStatus: jest.Mock;
const sockets = () => FakeSocket.instances;
const flush = () => jest.advanceTimersByTimeAsync(0);
const start = async (url = 'wss://rt.example/ws') => {
  const stop = subscribeRealtime({url, getToken, onEvent, onStatus});
  await flush();
  return stop;
};

beforeEach(() => {
  jest.useFakeTimers();
  jest.spyOn(Math, 'random').mockReturnValue(0);   // no jitter: delays are exactly 1000 * 2^n
  FakeSocket.instances = [];
  globalThis.WebSocket = FakeSocket as unknown as typeof WebSocket;
  getToken = jest.fn().mockResolvedValue('tok-1');
  onEvent = jest.fn();
  onStatus = jest.fn();
});
afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
  globalThis.WebSocket = originalWebSocket;
});

describe('connecting', () => {
  test('opens the socket with the token as a URL-encoded query parameter', async () => {
    getToken.mockResolvedValue('a b/c+d=');
    await start();
    expect(sockets()).toHaveLength(1);
    expect(sockets()[0].url).toBe('wss://rt.example/ws?token=a%20b%2Fc%2Bd%3D');
  });

  test('appends with & when the URL already has a query string', async () => {
    await start('wss://rt.example/ws?v=2');
    expect(sockets()[0].url).toBe('wss://rt.example/ws?v=2&token=tok-1');
  });

  test('reports connected only once the socket is actually open', async () => {
    await start();
    expect(onStatus).not.toHaveBeenCalled();
    sockets()[0].open();
    expect(onStatus).toHaveBeenCalledTimes(1);
    expect(onStatus).toHaveBeenLastCalledWith(true);
  });

  test('without a token it opens no socket, reports disconnected and retries', async () => {
    getToken.mockResolvedValueOnce(null).mockResolvedValue('tok-2');
    await start();
    expect(sockets()).toHaveLength(0);
    expect(onStatus).toHaveBeenCalledWith(false);
    await jest.advanceTimersByTimeAsync(1000);
    expect(sockets()).toHaveLength(1);
    expect(sockets()[0].url).toContain('token=tok-2');
  });

  test('a token lookup that throws is retried rather than crashing', async () => {
    getToken.mockRejectedValueOnce(new Error('refresh failed')).mockResolvedValue('tok-2');
    await start();
    expect(sockets()).toHaveLength(0);
    expect(onStatus).toHaveBeenLastCalledWith(false);
    await jest.advanceTimersByTimeAsync(1000);
    expect(sockets()).toHaveLength(1);
  });
});

describe('messages', () => {
  test('delivers parsed JSON objects to onEvent', async () => {
    await start();
    sockets()[0].open();
    sockets()[0].message(JSON.stringify({type: 'message.created', id: 'm1'}));
    expect(onEvent).toHaveBeenCalledWith({type: 'message.created', id: 'm1'});
  });

  test.each([['invalid JSON', '{nope'], ['JSON null', 'null'], ['a JSON number', '42'], ['a JSON string', '"hi"'], ['binary-ish garbage', '\u0000\u0001']])(
    'ignores %s without throwing or calling onEvent', async (_name, payload) => {
      await start();
      sockets()[0].open();
      expect(() => sockets()[0].message(payload)).not.toThrow();
      expect(onEvent).not.toHaveBeenCalled();
    });

  test('a throwing onEvent consumer does not kill the socket handler', async () => {
    onEvent.mockImplementationOnce(() => { throw new Error('consumer bug'); });
    await start();
    sockets()[0].open();
    expect(() => sockets()[0].message('{"a":1}')).not.toThrow();
    sockets()[0].message('{"b":2}');
    expect(onEvent).toHaveBeenLastCalledWith({b: 2});
  });
});

describe('heartbeat', () => {
  test('sends a ping frame every 30s while open, and not before', async () => {
    await start();
    sockets()[0].open();
    await jest.advanceTimersByTimeAsync(29999);
    expect(sockets()[0].sent).toEqual([]);
    await jest.advanceTimersByTimeAsync(1);
    expect(sockets()[0].sent).toEqual([JSON.stringify({action: 'ping'})]);
    await jest.advanceTimersByTimeAsync(60000);
    expect(sockets()[0].sent).toHaveLength(3);
  });

  test('skips the ping if the socket is no longer open', async () => {
    await start();
    sockets()[0].open();
    sockets()[0].readyState = 2;   // CLOSING
    await jest.advanceTimersByTimeAsync(30000);
    expect(sockets()[0].send).not.toHaveBeenCalled();
  });

  test('stops pinging the dead socket once it closes, and the new socket gets its own single heartbeat', async () => {
    await start();
    const first = sockets()[0];
    first.open();
    first.drop();
    await jest.advanceTimersByTimeAsync(1000);
    const second = sockets()[1];
    second.open();
    await jest.advanceTimersByTimeAsync(30000);
    expect(first.send).not.toHaveBeenCalled();
    expect(second.sent).toHaveLength(1);
  });
});

describe('reconnecting', () => {
  test('reports disconnected on close and reconnects after one second with a freshly fetched token', async () => {
    getToken.mockResolvedValueOnce('tok-1').mockResolvedValueOnce('tok-2');
    await start();
    sockets()[0].open();
    onStatus.mockClear();
    sockets()[0].drop();
    expect(onStatus).toHaveBeenCalledWith(false);
    await jest.advanceTimersByTimeAsync(999);
    expect(sockets()).toHaveLength(1);
    await jest.advanceTimersByTimeAsync(1);
    expect(sockets()).toHaveLength(2);
    expect(sockets()[1].url).toContain('token=tok-2');
    expect(getToken).toHaveBeenCalledTimes(2);
  });

  test('backs off exponentially (1s, 2s, 4s, 8s, 16s) and caps at 30s while the server keeps refusing', async () => {
    await start();
    const delays: number[] = [];
    for (let i = 0; i < 8; i++) {
      const count = sockets().length;
      sockets()[count - 1].drop();
      let waited = 0;
      while (sockets().length === count && waited < 40000) { await jest.advanceTimersByTimeAsync(500); waited += 500; }
      delays.push(waited);
    }
    expect(delays).toEqual([1000, 2000, 4000, 8000, 16000, 30000, 30000, 30000]);
  });

  test('adds up to 500ms of jitter', async () => {
    (Math.random as jest.Mock).mockReturnValue(0.999);
    await start();
    sockets()[0].drop();
    await jest.advanceTimersByTimeAsync(1000);
    expect(sockets()).toHaveLength(1);
    await jest.advanceTimersByTimeAsync(500);
    expect(sockets()).toHaveLength(2);
  });

  test('a successful open resets the backoff to one second', async () => {
    await start();
    for (let i = 0; i < 3; i++) { sockets()[sockets().length - 1].drop(); await jest.advanceTimersByTimeAsync(30500); }
    expect(sockets()).toHaveLength(4);
    sockets()[3].open();
    sockets()[3].drop();
    await jest.advanceTimersByTimeAsync(1000);
    expect(sockets()).toHaveLength(5);
  });

  test('a socket error closes the socket and leads to exactly one reconnect', async () => {
    await start();
    sockets()[0].onerror?.();
    expect(sockets()[0].close).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(1000);
    expect(sockets()).toHaveLength(2);
  });

  test('duplicate close notifications schedule only one reconnect', async () => {
    await start();
    sockets()[0].drop();
    sockets()[0].drop();
    await jest.advanceTimersByTimeAsync(1000);
    expect(sockets()).toHaveLength(2);
    await jest.advanceTimersByTimeAsync(60000);
    expect(sockets()).toHaveLength(2);
  });
});

describe('stopping', () => {
  test('stop closes the socket, cancels the heartbeat and never reconnects', async () => {
    const stop = await start();
    sockets()[0].open();
    stop();
    expect(sockets()[0].close).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(120000);
    expect(sockets()).toHaveLength(1);
    expect(sockets()[0].send).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
  });

  test('stop does not report a spurious status change or retry from the close it triggers', async () => {
    const stop = await start();
    sockets()[0].open();
    onStatus.mockClear();
    stop();
    expect(onStatus).not.toHaveBeenCalled();
  });

  test('stop while a reconnect is pending cancels it', async () => {
    const stop = await start();
    sockets()[0].drop();
    stop();
    await jest.advanceTimersByTimeAsync(60000);
    expect(sockets()).toHaveLength(1);
  });

  test('stop while the token is still being fetched never opens a socket', async () => {
    let resolveToken!: (token: string) => void;
    getToken.mockReturnValue(new Promise<string>(r => { resolveToken = r; }));
    const stop = subscribeRealtime({url: 'wss://rt.example/ws', getToken, onEvent, onStatus});
    stop();
    resolveToken('late');
    await flush();
    expect(sockets()).toHaveLength(0);
    expect(onStatus).not.toHaveBeenCalled();
  });

  test('a null token that arrives after stop does not schedule a retry', async () => {
    let resolveToken!: (token: string | null) => void;
    getToken.mockReturnValue(new Promise<string | null>(r => { resolveToken = r; }));
    const stop = subscribeRealtime({url: 'wss://rt.example/ws', getToken, onEvent, onStatus});
    stop();
    resolveToken(null);
    await flush();
    expect(jest.getTimerCount()).toBe(0);
  });

  test('events and open notifications from the socket after stop are ignored', async () => {
    const stop = await start();
    const socket = sockets()[0];
    stop();
    socket.readyState = FakeSocket.OPEN;
    socket.onopen?.();
    socket.message('{"late":true}');
    expect(onEvent).not.toHaveBeenCalled();
    expect(onStatus).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
  });
});

describe('send', () => {
  test('returns false and sends nothing before the socket is open', async () => {
    const stop = await start();
    expect(stop.send({action: 'typing'})).toBe(false);
    expect(sockets()[0].send).not.toHaveBeenCalled();
  });

  test('returns false when called before a socket exists at all', () => {
    const stop = subscribeRealtime({url: 'wss://rt.example/ws', getToken: () => new Promise(() => {}), onEvent, onStatus});
    expect(stop.send({action: 'x'})).toBe(false);
  });

  test('writes a JSON frame and returns true while open', async () => {
    const stop = await start();
    sockets()[0].open();
    expect(stop.send({action: 'typing', conversationId: 'c1'})).toBe(true);
    expect(sockets()[0].sent).toEqual([JSON.stringify({action: 'typing', conversationId: 'c1'})]);
  });

  test('returns false again after the socket drops', async () => {
    const stop = await start();
    sockets()[0].open();
    sockets()[0].drop();
    expect(stop.send({action: 'typing'})).toBe(false);
  });
});
