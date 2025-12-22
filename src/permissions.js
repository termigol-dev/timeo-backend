export function can(role, action) {
  const rules = {
    SUPERADMIN: [
      'dashboard',
      'employees',
      'branches',
      'reports',
      'profile',
    ],
    ADMIN_EMPRESA: [
      'dashboard',
      'employees',
      'branches',
      'reports',
      'profile',
    ],
    ADMIN_SUCURSAL: [
      'dashboard',
      'employees',
      'reports',
      'profile',
    ],
    EMPLEADO: [
      'reports',
      'profile',
    ],
  };

  return rules[role]?.includes(action);
}