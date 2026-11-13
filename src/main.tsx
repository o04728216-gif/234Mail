import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Prevent Safari / WebKit smart-zoom & gesture page zoom on click/tap across Mobile & PC
if (typeof document !== 'undefined') {
  const preventGestureZoom = (e: Event) => {
    e.preventDefault();
  };
  document.addEventListener('gesturestart', preventGestureZoom, { passive: false });
  document.addEventListener('gesturechange', preventGestureZoom, { passive: false });
  document.addEventListener('gestureend', preventGestureZoom, { passive: false });
}

createRoot(document.getElementById('root')!).render(<App />);
