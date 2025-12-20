export function can(role, action) {
  const rules = {
    SUPERADMIN: [
      'dashboard',
      'employees',
      'branches',
      'reports',
    ],
    ADMIN_EMPRESA: [
      'dashboard',
      'employees',
      'branches',
      'reports',
    ],
    ADMIN_SUCURSAL: [
      'dashboard',
      'employees',
      'reports',
    ],
    EMPLEADO: [
      'reports',
      'profile',
    ],
  };

  return rules[role]?.includes(action);
}