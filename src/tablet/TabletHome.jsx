import { useEffect, useState } from 'react';
import {
  getTabletEmployees,
  recordIn,
  recordOut,
} from './tabletApi';

export default function TabletHome({ onInvalidToken }) {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      const data = await getTabletEmployees();
      setEmployees(data);
    } catch (e) {
      if (e.status === 401) {
        localStorage.removeItem('tablet_token');
        onInvalidToken();
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleIn(id) {
    await recordIn(id);
    load();
  }

  async function handleOut(id) {
    await recordOut(id);
    load();
  }

  if (loading) return <div>Cargando…</div>;

  return (
    <div className="tablet-home">
      <h2>Fichaje</h2>

      {employees.map(e => {
        const last = e.user.records[0];
        const isIn = last?.type === 'IN';

        return (
          <div key={e.user.id} className="employee-row">
            <span>
              {e.user.name} {e.user.firstSurname}
            </span>

            <button
              onClick={() =>
                isIn ? handleOut(e.user.id) : handleIn(e.user.id)
              }
              style={{
                background: isIn ? '#ef4444' : '#22c55e',
              }}
            >
              {isIn ? 'OUT' : 'IN'}
            </button>
          </div>
        );
      })}
    </div>
  );
}