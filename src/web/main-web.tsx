/**
 * Web Entry Point
 * 
 * Detects environment (Electron vs Web Browser) and initializes appropriate API layer.
 */

import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import App from '../App';
import { LoginPage } from './LoginPage';
import { wsClient } from './websocket-client';
import { initTelemetry, trackAppStarted } from '../telemetry';
import type { IPCApi } from '../types/ipc';

// Initialize telemetry
initTelemetry();
trackAppStarted();

// Global error handlers
window.addEventListener('error', (event) => {
  console.error('Uncaught error in renderer:', event.error);
  console.error('Error details:', {
    message: event.message,
    filename: event.filename,
    lineno: event.lineno,
    colno: event.colno,
    error: event.error,
    stack: event.error?.stack,
  });
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled promise rejection in renderer:', event.reason);
  console.error('Promise:', event.promise);
  if (event.reason instanceof Error) {
    console.error('Stack:', event.reason.stack);
  }
});

// Detect if running in Electron
const isElectron = typeof window !== 'undefined' && 'api' in window;

function AppWithAuth() {
  const [api, setApi] = useState<IPCApi | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initializeAPI = async () => {
      if (isElectron) {
        // In Electron, use the preloaded API
        setApi((window as any).api);
        setLoading(false);
      } else {
        // In web browser, check for existing token
        const token = localStorage.getItem('cmux_token');
        
        if (token) {
          try {
            // Verify token is still valid
            const response = await fetch('/auth/verify', {
              headers: { Authorization: `Bearer ${token}` },
            });

            if (response.ok) {
              // Connect WebSocket with existing token
              await wsClient.connect(token);
              setApi(wsClient.createAPI());
            } else {
              // Token invalid, clear it
              localStorage.removeItem('cmux_token');
              localStorage.removeItem('cmux_userId');
            }
          } catch (error) {
            console.error('Failed to verify existing token:', error);
            localStorage.removeItem('cmux_token');
            localStorage.removeItem('cmux_userId');
          }
        }
        
        setLoading(false);
      }
    };

    initializeAPI();
  }, []);

  if (loading) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh', 
        background: '#1e1e1e',
        color: '#cccccc',
        fontFamily: 'var(--font-primary)'
      }}>
        <div>Loading cmux...</div>
      </div>
    );
  }

  // In Electron or authenticated web session, show main app
  if (api) {
    // Expose API globally (for compatibility with existing code)
    if (!isElectron) {
      (window as any).api = api;
    }
    return <App />;
  }

  // In web without auth, show login page
  return <LoginPage onLogin={(newApi) => setApi(newApi)} />;
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppWithAuth />
  </React.StrictMode>
);
