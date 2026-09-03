import { Link, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import { AppProvider, useApp } from '@/context/AppContext';
import { EveningLayout } from '@/pages/EveningLayout';
import { EveningPage } from '@/pages/EveningPage';
import { EveningOrderPage } from '@/pages/EveningOrderPage';
import { FlyPage } from '@/pages/FlyPage';
import { FreePage } from '@/pages/FreePage';
import { LandPage } from '@/pages/LandPage';
import { CheckpointPage } from '@/pages/CheckpointPage';
import { CancelledPage } from '@/pages/CancelledPage';
import { SettingsPage } from '@/pages/SettingsPage';
import '@/styles/global.css';

function SessionRouter() {
  const { session, blocks, tickFlying } = useApp();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const id = window.setInterval(() => void tickFlying(), 1000);
    return () => clearInterval(id);
  }, [tickFlying]);

  useEffect(() => {
    if (!session) return;
    if (session.status === 'cancelled') {
      if (location.pathname !== '/cancelled' && location.pathname !== '/settings') {
        navigate('/cancelled', { replace: true });
      }
      return;
    }
    if (session.checkpoint) {
      navigate('/checkpoint', { replace: true });
      return;
    }
    if (session.status === 'dayEnd') {
      navigate('/land', { replace: true });
      return;
    }
    if (session.status === 'freeFly') {
      navigate('/free', { replace: true });
      return;
    }
    if (session.status === 'flying' && session.currentBlockId) {
      const current = blocks.find((b) => b.id === session.currentBlockId);
      if (current?.type === 'free') {
        navigate('/free', { replace: true });
      } else if (current && current.type !== 'terminal') {
        navigate(`/fly/${current.id}`, { replace: true });
      }
    }
  }, [session, blocks, navigate, location.pathname]);

  return null;
}

function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-shell">
      <header className="app-header">
        <Link to="/evening" className="brand">
          Time Flight
        </Link>
        <nav>
          <Link to="/evening">航程</Link>
          <Link to="/settings">设置</Link>
        </nav>
      </header>
      <main className="app-main">{children}</main>
    </div>
  );
}

function AppRoutes() {
  return (
    <>
      <SessionRouter />
      <Layout>
        <Routes>
          <Route path="/" element={<Navigate to="/evening" replace />} />
          <Route path="/start.html" element={<Navigate to="/evening" replace />} />
          <Route path="/evening" element={<EveningLayout />}>
            <Route index element={<EveningPage />} />
            <Route path="order" element={<EveningOrderPage />} />
          </Route>
          <Route path="/fly/:blockId" element={<FlyPage />} />
          <Route path="/free" element={<FreePage />} />
          <Route path="/checkpoint" element={<CheckpointPage />} />
          <Route path="/land" element={<LandPage />} />
          <Route path="/cancelled" element={<CancelledPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </Layout>
    </>
  );
}

export default function App() {
  return (
    <AppProvider>
      <AppRoutes />
    </AppProvider>
  );
}
