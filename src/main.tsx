import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App.tsx';
import './index.css';

registerSW({ immediate: true });

// Ensure all browsers (Chrome, Safari, Firefox, Edge, Brave) render the crisp Apple 🚀 favicon
if (typeof document !== 'undefined') {
  const preventGestureZoom = (e: Event) => {
    e.preventDefault();
  };
  document.addEventListener('gesturestart', preventGestureZoom, { passive: false });
  document.addEventListener('gesturechange', preventGestureZoom, { passive: false });
  document.addEventListener('gestureend', preventGestureZoom, { passive: false });

  // Remove any stale SVG icon links that could shadow raster Apple emoji favicons
  document
    .querySelectorAll('link[rel*="icon"][type="image/svg+xml"]')
    .forEach((el) => el.parentNode?.removeChild(el));
}

createRoot(document.getElementById('root')!).render(<App />);
