import { useApp } from '@/context/AppContext';

export function CancelVoyageButton() {
  const { cancelVoyage } = useApp();
  return (
    <button type="button" className="cancel-voyage-btn" onClick={() => void cancelVoyage()}>
      取消当前航班
    </button>
  );
}

export function CancelledPage() {
  return (
    <div className="cancelled-screen">
      <h1>今日航班取消</h1>
    </div>
  );
}
