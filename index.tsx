import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// One-time cleanup of stale v3.2/v3.6 localStorage entries (old 'Beograd' cached report & demo streets)
try {
  const CLEANUP_KEY = 'commute_companion_cleanup_v3_7';
  if (!localStorage.getItem(CLEANUP_KEY)) {
    const rawPrefs = localStorage.getItem('commute_companion_prefs_v3');
    if (rawPrefs) {
      const parsed = JSON.parse(rawPrefs);
      if (
        Array.isArray(parsed.savedStreets) &&
        (parsed.savedStreets.includes('Skerlićeva 12') ||
          parsed.savedStreets.includes('Kneza Višeslava 88'))
      ) {
        parsed.savedStreets = [];
      }
      if (parsed.mode !== 'manual') {
        parsed.mode = 'manual';
      }
      localStorage.setItem('commute_companion_prefs_v3', JSON.stringify(parsed));
    }
    localStorage.removeItem('commute_companion_history_v3');
    localStorage.setItem(CLEANUP_KEY, '1');
  }
} catch {
  // ignore storage errors
}

class RootErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; errorText: string }
> {
  declare state: { hasError: boolean; errorText: string };
  declare props: { children: React.ReactNode };
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, errorText: '' };
  }
  static getDerivedStateFromError(error: any) {
    return { hasError: true, errorText: String(error?.message || error || 'Greška u prikazu') };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            minHeight: '100vh',
            background: '#090d16',
            color: '#f1f5f9',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
            textAlign: 'center',
            fontFamily: 'system-ui, sans-serif',
          }}
        >
          <h2 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '8px' }}>
            Osvežavanje aplikacije
          </h2>
          <p style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '16px', maxWidth: '340px' }}>
            {this.state.errorText}
          </p>
          <button
            type="button"
            onClick={() => {
              try {
                localStorage.removeItem('commute_companion_history_v3');
              } catch {
                // ignore
              }
              window.location.reload();
            }}
            style={{
              padding: '10px 18px',
              borderRadius: '12px',
              background: '#4f46e5',
              color: '#fff',
              fontWeight: 600,
              fontSize: '14px',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            Ponovo učitaj
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Could not find root element to mount to');
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <RootErrorBoundary>
      <App />
    </RootErrorBoundary>
  </React.StrictMode>
);

if ('serviceWorker' in navigator && /^https?:/.test(window.location.protocol)) {
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return;
    reloading = true;
    window.location.reload();
  });

  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SW_ACTIVATED' && !reloading) {
      const reloadedVersion = sessionStorage.getItem('cc_sw_reloaded');
      if (reloadedVersion !== event.data.version) {
        sessionStorage.setItem('cc_sw_reloaded', event.data.version);
        reloading = true;
        window.location.reload();
      }
    }
  });

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('./sw.js', { updateViaCache: 'none' })
      .then((reg) => {
        reg.update().catch(() => {});
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') {
            reg.update().catch(() => {});
          }
        });
      })
      .catch(() => {});
  });
}
