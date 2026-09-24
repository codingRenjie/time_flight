type DebugEvent = {
  t: string;
  href: string;
  ua: string;
  secure: boolean;
  type: string;
  message: string;
  stack?: string;
};

function post(event: DebugEvent) {
  const body = JSON.stringify(event);
  try {
    if (navigator.sendBeacon) {
      navigator.sendBeacon('/__debug-log', new Blob([body], { type: 'application/json' }));
      return;
    }
  } catch {
    /* fall through */
  }
  void fetch('/__debug-log', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    keepalive: true,
  }).catch(() => undefined);
}

const base = () => ({
  t: new Date().toISOString(),
  href: location.href,
  ua: navigator.userAgent,
  secure: window.isSecureContext,
});

/** 临时诊断日志（音频排障用），写入 dev server 的 .tmp/device-debug.jsonl */
export function logDebug(type: string, message: string): void {
  post({ ...base(), type, message });
}

export function installDebugBeacon() {
  post({ ...base(), type: 'boot', message: 'boot' });

  window.addEventListener('error', (e) => {
    post({
      ...base(),
      type: 'error',
      message: e.message || String(e.error || 'error'),
      stack: e.error instanceof Error ? e.error.stack : undefined,
    });
  });

  window.addEventListener('unhandledrejection', (e) => {
    const reason = e.reason;
    post({
      ...base(),
      type: 'unhandledrejection',
      message: reason instanceof Error ? reason.message : String(reason),
      stack: reason instanceof Error ? reason.stack : undefined,
    });
  });
}
