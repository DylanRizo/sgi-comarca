export const bootstrapRoles = [
  {
    code: 'ADMIN',
    name: 'Administración',
    description: 'Rol estructural sin permisos implícitos en FASE 3A.',
  },
  {
    code: 'PARTNER',
    name: 'Socio',
    description: 'Rol estructural sin permisos implícitos en FASE 3A.',
  },
  {
    code: 'INVENTORY_MANAGER',
    name: 'Gestión de inventario',
    description: 'Capacidades explícitas de inventario.',
  },
  {
    code: 'SALES',
    name: 'Ventas',
    description: 'Capacidades explícitas de ventas.',
  },
  {
    code: 'FINANCE',
    name: 'Finanzas',
    description: 'Capacidades explícitas de finanzas y cierres.',
  },
  {
    code: 'READ_ONLY',
    name: 'Solo lectura',
    description: 'Rol estructural vacío en FASE 3A.',
  },
] as const;

export const bootstrapPermissions = [
  {
    code: 'users.invitations.create',
    description: 'Crear invitaciones de activación para usuarios.',
  },
  {
    code: 'users.credentials.revoke',
    description: 'Revocar credenciales de usuarios.',
  },
  {
    code: 'users.sessions.revoke',
    description: 'Revocar sesiones de usuarios.',
  },
  {
    code: 'users.status.manage',
    description: 'Administrar el estado de usuarios.',
  },
  {
    code: 'finances.read',
    description: 'Consultar información financiera autorizada.',
  },
  {
    code: 'finances.manual.create',
    description: 'Registrar movimientos financieros manuales.',
  },
  {
    code: 'closings.read',
    description: 'Consultar cierres diarios.',
  },
  {
    code: 'closings.create',
    description: 'Crear cierres diarios.',
  },
  {
    code: 'closings.reopen',
    description: 'Reabrir cierres diarios con auditoría.',
  },
  {
    code: 'inventory.adjust',
    description: 'Realizar ajustes de inventario.',
  },
  {
    code: 'inventory.read',
    description:
      'Consultar productos, unidades, almacenes, balances y valoraciones de inventario.',
  },
  {
    code: 'sales.cancel',
    description: 'Cancelar ventas elegibles.',
  },
  {
    code: 'sales.create',
    description: 'Crear ventas.',
  },
  {
    code: 'sales.confirm_in_transit',
    description: 'Confirmar ventas en tránsito.',
  },
  {
    code: 'transfers.create',
    description: 'Crear transferencias; sin grants en FASE 3A.',
  },
] as const;

export const bootstrapUsers = [
  { loginIdentifier: 'dylan', displayName: 'Dylan' },
  { loginIdentifier: 'samantha', displayName: 'Samantha' },
  { loginIdentifier: 'jean', displayName: 'Jean' },
  { loginIdentifier: 'luden', displayName: 'Luden' },
] as const;

export const bootstrapWarehouses = [
  { code: 'CASA_DYLAN', name: 'Casa Dylan' },
  { code: 'CASA_LUDEN', name: 'Casa Luden' },
  { code: 'CASA_JEAN', name: 'Casa Jean' },
] as const;

export const bootstrapUserRoles = [
  { loginIdentifier: 'dylan', roleCode: 'ADMIN' },
  { loginIdentifier: 'dylan', roleCode: 'FINANCE' },
  { loginIdentifier: 'samantha', roleCode: 'FINANCE' },
  { loginIdentifier: 'dylan', roleCode: 'INVENTORY_MANAGER' },
  { loginIdentifier: 'samantha', roleCode: 'INVENTORY_MANAGER' },
  { loginIdentifier: 'jean', roleCode: 'INVENTORY_MANAGER' },
  { loginIdentifier: 'luden', roleCode: 'INVENTORY_MANAGER' },
  { loginIdentifier: 'dylan', roleCode: 'SALES' },
  { loginIdentifier: 'samantha', roleCode: 'SALES' },
  { loginIdentifier: 'jean', roleCode: 'SALES' },
  { loginIdentifier: 'luden', roleCode: 'SALES' },
] as const;

export const bootstrapRolePermissions = [
  {
    roleCode: 'ADMIN',
    permissionCode: 'users.invitations.create',
  },
  {
    roleCode: 'ADMIN',
    permissionCode: 'users.credentials.revoke',
  },
  { roleCode: 'ADMIN', permissionCode: 'users.sessions.revoke' },
  { roleCode: 'ADMIN', permissionCode: 'users.status.manage' },
  { roleCode: 'FINANCE', permissionCode: 'finances.read' },
  { roleCode: 'FINANCE', permissionCode: 'finances.manual.create' },
  { roleCode: 'FINANCE', permissionCode: 'closings.read' },
  { roleCode: 'FINANCE', permissionCode: 'closings.create' },
  { roleCode: 'FINANCE', permissionCode: 'closings.reopen' },
  {
    roleCode: 'INVENTORY_MANAGER',
    permissionCode: 'inventory.adjust',
  },
  {
    roleCode: 'INVENTORY_MANAGER',
    permissionCode: 'inventory.read',
  },
  {
    roleCode: 'INVENTORY_MANAGER',
    permissionCode: 'transfers.create',
  },
  { roleCode: 'SALES', permissionCode: 'sales.create' },
  {
    roleCode: 'SALES',
    permissionCode: 'sales.confirm_in_transit',
  },
] as const;

export const bootstrapUserPermissions = [
  { loginIdentifier: 'dylan', permissionCode: 'sales.cancel' },
] as const;

export function grantKey(left: string, right: string): string {
  return left + ':' + right;
}
