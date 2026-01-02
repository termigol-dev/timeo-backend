const API_BASE = import.meta.env.VITE_API_BASE;

async function tabletApi(path, method = 'GET', body) {
  const token = localStorage.getItem('tablet_token');

  const res = await fetch(`${API_BASE}/tablet${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const err = new Error('Tablet API error');
    err.status = res.status;
    throw err;
  }

  return res.json();
}

export function getTabletEmployees() {
  return tabletApi('/employees');
}

export function recordIn(userId) {
  return tabletApi(`/in/${userId}`, 'POST');
}

export function recordOut(userId) {
  return tabletApi(`/out/${userId}`, 'POST');
}