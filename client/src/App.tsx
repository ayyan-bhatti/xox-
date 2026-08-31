import { useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import Cursor from './components/Cursor';
import Header from './components/Header';
import { ToastProvider } from './components/Toast';
import './components/ui.css';
import { initMotion } from './lib/motion';
import { initSound } from './lib/sound';
import Landing from './pages/Landing';
import LocalGame from './pages/LocalGame';
import OnlineGame from './pages/OnlineGame';
import SoloGame from './pages/SoloGame';

export default function App() {
  const location = useLocation();

  useEffect(() => {
    initSound();
    return initMotion();
  }, []);

  return (
    <ToastProvider>
      <Cursor />

      <div className="shell">
        <Header />

        <main className="shell__body">
          {/* Keyed on pathname so each route replays its entrance animation. */}
          <Routes location={location} key={location.pathname}>
            <Route path="/" element={<Landing />} />
            <Route path="/local" element={<LocalGame />} />
            <Route path="/solo" element={<SoloGame />} />
            <Route path="/play/:roomId" element={<OnlineGame />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </ToastProvider>
  );
}
