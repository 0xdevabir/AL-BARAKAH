export type Role = 'CUSTOMER' | 'ADMIN' | 'RIDER' | 'DOCTOR';

/** Single source of truth for who may do what; the API enforces it and the UIs read it. */
export const PERMISSIONS = {
  'self:read': ['CUSTOMER', 'ADMIN', 'RIDER', 'DOCTOR'],
  'address:manage': ['CUSTOMER'],
  'order:create': ['CUSTOMER'],
  'order:read-own': ['CUSTOMER'],
  'consultation:book': ['CUSTOMER'],
  'payment:create': ['CUSTOMER'],
  'prescription:upload': ['CUSTOMER'],
  'catalog:manage': ['ADMIN'],
  'order:manage': ['ADMIN'],
  'prescription:read': ['ADMIN'],
  'staff:manage': ['ADMIN'],
  'settings:manage': ['ADMIN'],
  'consultation:manage': ['ADMIN'],
  'ledger:manage': ['ADMIN'],
  'delivery:work': ['RIDER'],
  'doctor:work': ['DOCTOR'],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;

export function roleHas(role: Role, permission: Permission): boolean {
  return (PERMISSIONS[permission] as readonly Role[]).includes(role);
}
