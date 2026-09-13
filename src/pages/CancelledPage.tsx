import { useNavigate } from 'react-router-dom';
import { useApp } from '@/context/AppContext';
import { SkyBackground } from '@/components/SkyBackground';

/** 页面07：航程取消页 */
export function CancelledPage() {
  const navigate = useNavigate();
  const { resetVoyage } = useApp();

  const handleRestart = async () => {
    await resetVoyage();
    navigate('/start', { replace: true });
  };

  return (
    <div className="fullscreen-page">
      <SkyBackground image="/assets/bg-landing.png" dim={0.5} />
      <div className="fullscreen-content cancelled-content">
        <h1 className="cancelled-title">航程已取消</h1>
        <p className="cancelled-sub">飞机已滑回停机坪，休息一下再出发</p>
        <button className="btn btn-primary btn-lg" onClick={() => void handleRestart()}>
          开始新的航程
        </button>
      </div>
    </div>
  );
}
