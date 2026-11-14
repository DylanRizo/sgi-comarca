import type {
  MarketplaceBotCommandStatus,
  MarketplaceBotCommandType,
  MarketplaceBotConnection,
  MarketplaceBotListingAction,
  MarketplaceBotSafetyLevel,
} from '@sgi/contracts';

export const connectionLabels: Record<MarketplaceBotConnection, string> = {
  DELAYED: 'Con retraso',
  OFFLINE: 'Sin señal',
  ONLINE: 'En línea',
};

export const connectionTones: Record<MarketplaceBotConnection, string> = {
  DELAYED: 'warning',
  OFFLINE: 'cancelled',
  ONLINE: 'completed',
};

export const safetyLabels: Record<MarketplaceBotSafetyLevel, string> = {
  active: 'Activo',
  balanced: 'Equilibrado',
  conservative: 'Conservador',
};

export const commandLabels: Record<MarketplaceBotCommandType, string> = {
  APPROVE_QUEUE_ITEMS: 'Aprobar cola propuesta',
  CANCEL_LISTING_ACTION: 'Cancelar acción de anuncio',
  GENERATE_WEEK: 'Generar calendario semanal',
  LISTING_ACTION: 'Acción sobre anuncio',
  PAUSE_ACCOUNT: 'Pausar cuenta',
  QUEUE_ITEM_ACTION: 'Acción en ítem de cola',
  REQUEST_SCAN: 'Escanear anuncios y leads',
  RESOLVE_ALERT: 'Resolver alerta',
  RESOLVE_ALL_ALERTS: 'Resolver todas las alertas',
  RESUME_ACCOUNT: 'Reanudar cuenta',
  SET_BOT_ENABLED: 'Cambiar encendido del bot',
  SET_SAFETY_LEVEL: 'Cambiar nivel de seguridad',
  SYNC_SGI_CATALOG: 'Sincronizar catálogo SGI',
};

export const commandStatusLabels: Record<MarketplaceBotCommandStatus, string> =
  {
    CANCELLED: 'Cancelado',
    COMPLETED: 'Completado',
    EXPIRED: 'Expirado',
    FAILED: 'Falló',
    PENDING: 'Pendiente',
  };

export const commandStatusTones: Record<MarketplaceBotCommandStatus, string> = {
  CANCELLED: 'warning',
  COMPLETED: 'completed',
  EXPIRED: 'warning',
  FAILED: 'cancelled',
  PENDING: 'transit',
};

export const listingActionLabels: Record<MarketplaceBotListingAction, string> =
  {
    delete: 'Eliminar',
    mark_available: 'Marcar disponible',
    mark_out_of_stock: 'Marcar agotado',
    relist: 'Republicar',
    renew: 'Renovar',
  };

export const dateFormatter = new Intl.DateTimeFormat('es-NI', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'America/Managua',
});

export function formatDate(value: string | null): string {
  if (!value) return 'Nunca';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : dateFormatter.format(parsed);
}

export function formatSafetyLevel(level: string): string {
  if (level === 'conservative' || level === 'balanced' || level === 'active') {
    return safetyLabels[level];
  }
  return level || 'Equilibrado';
}
