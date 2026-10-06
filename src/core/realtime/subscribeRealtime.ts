type Options = {
  url: string; getToken: () => Promise<string | null>;
  onEvent: (event: Record<string, unknown>) => void;
  onStatus: (connected: boolean) => void;
};

/** Authenticated socket with fresh credentials, bounded retry and heartbeat. */
export function subscribeRealtime({url, getToken, onEvent, onStatus}: Options) {
  let stopped = false;
  let socket: WebSocket | undefined;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let attempt = 0;
  const schedule = () => {
    if (stopped || retry) return;
    clearInterval(heartbeat);
    onStatus(false);
    retry = setTimeout(() => {retry = undefined; connect();}, Math.min(30000, 1000 * 2 ** Math.min(attempt++, 5)) + Math.random() * 500);
  };
  const connect = async () => {
    try {
      const token = await getToken();
      if (stopped) return;
      if (!token) {schedule(); return;}
      socket = new WebSocket(url + (url.includes('?') ? '&' : '?') + 'token=' + encodeURIComponent(token));
      socket.onopen = () => {
        if (stopped) return;
        attempt = 0;
        onStatus(true);
        heartbeat = setInterval(() => {if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({action: 'ping'}));}, 30000);
      };
      socket.onmessage = ({data}) => {
        if (stopped) return;
        try {const event = JSON.parse(String(data)); if (event && typeof event === 'object') onEvent(event);} catch {}
      };
      socket.onclose = schedule;
      socket.onerror = () => socket?.close();
    } catch {schedule();}
  };
  connect();
  return () => {stopped = true; clearTimeout(retry); clearInterval(heartbeat); socket?.close();};
}
