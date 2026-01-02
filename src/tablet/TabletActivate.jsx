import { useState } from 'react';

export default function TabletActivate({ onActivated }) {
  const [token, setToken] = useState('');
  const [error, setError] = useState('');

  async function activate() {
    setError('');

    try {
      const res = await fetch(
        `${import.meta.env.VITE_API_BASE}/tablet/employees`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!res.ok) throw new Error();

      // ✅ solo guardamos si es válido
      localStorage.setItem('tablet_token', token.trim());
      onActivated();
    } catch {
      localStorage.removeItem('tablet_token');
      setError('Código inválido');
    }
  }

  return (
    <div className="tablet-activate">
      <h2>Activar tablet</h2>

      <input
        placeholder="Código de activación"
        value={token}
        onChange={e => setToken(e.target.value)}
      />

      {error && <p style={{ color: 'red' }}>{error}</p>}

      <button onClick={activate}>Activar</button>
    </div>
  );
}