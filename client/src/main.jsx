import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/global.css';
import { installNativeFetch, loadNativeToken, loadFileToken, configureNativeUI } from './lib/nativeApi';

// On native (Capacitor) builds, install the API base-URL + Bearer-token fetch
// wrapper, load the stored token, and mint the file-access token BEFORE first
// render — so the initial /me (and its avatar URL) is authenticated and images
// resolve. On web all three are no-ops and render is immediate.
async function boot() {
  installNativeFetch();
  await loadNativeToken();
  await loadFileToken();
  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
  // Style the status bar + dismiss the launch splash now that the app is up.
  configureNativeUI();
}
boot();
