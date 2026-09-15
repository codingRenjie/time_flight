import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import { AppProvider, useApp } from '@/context/AppContext';
import { StartPage } from '@/pages/StartPage';
import { PlanPage } from '@/pages/PlanPage';
import { OrderPage } from '@/pages/OrderPage';
import { TakeoffPage } from '@/pages/TakeoffPage';
import { FlyPage } from '@/pages/FlyPage';
import { ArrivedPage } from '@/pages/ArrivedPage';
import { NextTakeoffPage } from '@/pages/NextTakeoffPage';
import { CancelledPage } from '@/pages/CancelledPage';
import { CompletePage } from '@/pages/CompletePage';
import { SettingsPage } from '@/pages/SettingsPage';
import { BadgeWallPage } from '@/pages/BadgeWallPage';
import '@/styles/global.css';

/** 会话状态路由守卫：刷新/重开时把用户带回正确的页面 */
function SessionRouter() {
  const { session, tickFlying } = useApp();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const id = window.setInterval(() => void tickFlying(), 1000);
    return () => clearInterval(id);
  }, [tickFlying]);

  useEffect(() => {
    const path = location.pathname;
    // 设置页和徽章墙任何时候都可以停留
    if (path === '/settings' || path === '/badges') return;

    if (!session) {
      // 无航程：只允许规划流程的三个页面
      if (path !== '/start' && path !== '/plan' && path !== '/order') {
        navigate('/start', { replace: true });
      }
      return;
    }
    switch (session.status) {
      case 'cancelled':
        if (path !== '/cancelled') navigate('/cancelled', { replace: true });
        break;
      case 'dayEnd':
        if (path !== '/complete') navigate('/complete', { replace: true });
        break;
      case 'ready':
        if (path !== '/takeoff') navigate('/takeoff', { replace: true });
        break;
      case 'flying':
        if (session.currentBlockId && path !== `/fly/${session.currentBlockId}`) {
          navigate(`/fly/${session.currentBlockId}`, { replace: true });
        }
        break;
      case 'betweenFlights':
        if (path !== '/arrived' && path !== '/next') {
          navigate('/arrived', { replace: true });
        }
        break;
    }
  }, [session, navigate, location.pathname]);

  return null;
}

function AppRoutes() {
  return (
    <>
      <SessionRouter />
      <Routes>
        <Route path="/" element={<Navigate to="/start" replace />} />
        <Route path="/start" element={<StartPage />} />
        <Route path="/plan" element={<PlanPage />} />
        <Route path="/order" element={<OrderPage />} />
        <Route path="/takeoff" element={<TakeoffPage />} />
        <Route path="/fly/:blockId" element={<FlyPage />} />
        <Route path="/arrived" element={<ArrivedPage />} />
        <Route path="/next" element={<NextTakeoffPage />} />
        <Route path="/cancelled" element={<CancelledPage />} />
        <Route path="/complete" element={<CompletePage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/badges" element={<BadgeWallPage />} />
        <Route path="*" element={<Navigate to="/start" replace />} />
      </Routes>
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
