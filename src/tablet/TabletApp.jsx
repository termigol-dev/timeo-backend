import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import TabletActivate from './TabletActivate';
import TabletHome from './TabletHome';

export default function TabletApp() {
  const location = useLocation();
  const navigate = useNavigate();

  const [active, setActive] = useState(
    !!localStorage.getItem('tablet_token')
  );

  /* ───────── ACTIVACIÓN POR QR ───────── */
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const tokenFromQr = params.get('token');

    if (tokenFromQr) {
      // guardamos token
      localStorage.setItem('tablet_token', tokenFromQr);
      setActive(true);

      // limpiamos la URL (buena práctica)
      navigate('/tablet', { replace: true });
    }
  }, [location.search, navigate]);

  /* ───────── RENDER ───────── */
  if (!active) {
    return (
      <TabletActivate
        onActivated={() => setActive(true)}
      />
    );
  }

  return (
    <TabletHome
      onInvalidToken={() => {
        localStorage.removeItem('tablet_token');
        setActive(false);
      }}
    />
  );
}