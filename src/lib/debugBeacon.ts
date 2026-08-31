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

export function installDebugBeacon() {
  const base = () => ({
    t: new Date().toISOString(),
    href: location.href,
    ua: navigator.userAgent,
    secure: window.isSecureContext,
  });

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
