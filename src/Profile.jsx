import { useEffect, useState } from 'react';
import { getMe, changeMyPassword, updateMyPhoto } from './api';

export default function Profile() {
  const [me, setMe] = useState(null);
  const [password, setPassword] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');

  useEffect(() => {
    getMe().then(setMe);
  }, []);

  async function onChangePassword() {
    if (!password) return;
    await changeMyPassword(password);
    alert('Contraseña actualizada');
    setPassword('');
  }

  async function onSavePhoto() {
    if (!photoUrl) return;
    await updateMyPhoto(photoUrl);
    alert('Foto actualizada');
    setPhotoUrl('');
    setMe({ ...me, photoUrl });
  }

  if (!me) return <p>Cargando perfil…</p>;

  return (
    <div className="card">
      <h2>Mi perfil</h2>

      <div style={{ marginBottom: 16 }}>
        <strong>{me.name}</strong><br />
        {me.email}<br />
        <small>{me.role}</small>
      </div>

      <div style={{ marginBottom: 16 }}>
        <label>Nueva contraseña</label>
        <input
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
        />
        <button onClick={onChangePassword}>Cambiar contraseña</button>
      </div>

      <div>
        <label>Foto (URL)</label>
        <input
          value={photoUrl}
          onChange={e => setPhotoUrl(e.target.value)}
        />
        <button onClick={onSavePhoto}>Guardar foto</button>
      </div>
    </div>
  );
}