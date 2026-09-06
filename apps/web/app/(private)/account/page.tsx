'use client';

import Link from 'next/link';
import { useAuth } from '@/providers/auth-provider';

const labels: Record<string, string> = {
  'inventory.read': 'Consultar productos y existencias',
  'inventory.adjust': 'Ajustar existencias',
  'products.manage': 'Crear y editar productos',
  'stock-receipts.create': 'Registrar entradas',
  'inventory.valuation.manage': 'Completar costos y precios',
  'transfers.create': 'Transferir entre bodegas',
  'sales.read': 'Consultar ventas',
  'sales.create': 'Registrar ventas',
  'sales.cancel': 'Cancelar ventas elegibles',
  'sales.confirm_in_transit': 'Confirmar ventas en tránsito',
  'finances.read': 'Consultar información financiera',
  'finances.manual.create': 'Registrar ingresos y gastos',
  'closings.read': 'Consultar cierres',
  'closings.create': 'Crear cierres',
  'closings.reopen': 'Reabrir cierres',
  'inventory.audit.create': 'Realizar y corregir conteos abiertos',
  'inventory.audit.approve': 'Aprobar conteos',
  'reports.read': 'Consultar reportes',
  'analytics.read': 'Consultar análisis',
  'users.invitations.create': 'Crear invitaciones privadas',
  'users.credentials.revoke': 'Revocar credenciales',
  'users.sessions.revoke': 'Cerrar sesiones de usuarios',
  'users.status.manage': 'Administrar acceso de usuarios',
};

export default function AccountPage() {
  const { state } = useAuth();
  if (state.kind !== 'authenticated') return null;
  const session = state.session;
  const date = (value: string) =>
    new Intl.DateTimeFormat('es-NI', {
      timeZone: 'America/Managua',
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value));
  return (
    <main className="content-page" id="main-content">
      <header className="page-heading">
        <div>
          <h1>Mi cuenta</h1>
          <p>
            {session.displayName} · {session.identifier}
          </p>
        </div>
        <Link className="primary-button" href="/account/change-password">
          Cambiar contraseña
        </Link>
      </header>
      <section className="detail-section">
        <h2>Acciones disponibles</h2>
        <ul className="account-permissions">
          {session.permissions.map((permission) => (
            <li key={permission}>
              {labels[permission] ?? 'Permiso adicional de administración'}
            </li>
          ))}
        </ul>
      </section>
      <details className="detail-section">
        <summary>Detalles de la sesión</summary>
        <dl className="session-details">
          <div>
            <dt>Expira por inactividad</dt>
            <dd>{date(session.idleExpiresAt)}</dd>
          </div>
          <div>
            <dt>Límite de la sesión</dt>
            <dd>{date(session.absoluteExpiresAt)}</dd>
          </div>
        </dl>
        <ul className="permissions-list">
          {session.permissions.map((permission) => (
            <li key={permission}>{permission}</li>
          ))}
        </ul>
      </details>
    </main>
  );
}
