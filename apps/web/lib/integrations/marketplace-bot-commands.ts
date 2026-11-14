import type {
  MarketplaceBotCommandPayload,
  MarketplaceBotCommandView,
  MarketplaceBotSnapshot,
} from '@sgi/contracts';

/**
 * Text to confirm with the person before queuing a command the bot cannot
 * undo, or `null` when the command is safe to queue directly. The bot runs
 * the order on Facebook Marketplace, out of the SGI's reach, so the question
 * names what will be affected.
 */
export function destructiveCommandConfirmation(
  command: MarketplaceBotCommandPayload,
  snapshot: MarketplaceBotSnapshot,
): string | null {
  switch (command.type) {
    case 'LISTING_ACTION': {
      if (command.action !== 'delete') return null;
      const title = snapshot.listings.items.find(
        (listing) => listing.key === command.key,
      )?.title;
      return `¿Eliminar ${title ? `el anuncio "${title}"` : 'este anuncio'} de Marketplace? El bot lo borrará en su próximo pulso y no se puede deshacer desde el SGI.`;
    }
    case 'QUEUE_ITEM_ACTION': {
      if (command.action !== 'cancel') return null;
      const name = snapshot.queue.upcoming.find(
        (item) => item.id === command.id,
      )?.name;
      return `¿Cancelar la publicación programada${name ? ` de "${name}"` : ''}? Saldrá del calendario del bot.`;
    }
    case 'GENERATE_WEEK':
      return command.replace
        ? '¿Reemplazar el calendario de la semana? Las publicaciones ya propuestas se descartarán.'
        : null;
    case 'RESOLVE_ALL_ALERTS':
      return `¿Marcar como resueltas las ${snapshot.alerts.length.toString()} alertas activas? Dejarán de mostrarse.`;
    default:
      return null;
  }
}

/**
 * A command can only be cancelled while the bot has not been given it. After
 * that the bot may already be running it, and the SGI cannot take it back.
 */
export function canCancelCommand(
  command: Pick<MarketplaceBotCommandView, 'deliveredAt' | 'status'>,
): boolean {
  return command.status === 'PENDING' && command.deliveredAt === null;
}

/** What a still-pending command is waiting for. */
export function pendingCommandHint(
  command: Pick<MarketplaceBotCommandView, 'deliveredAt' | 'status'>,
): string | null {
  if (command.status !== 'PENDING') return null;
  return command.deliveredAt === null
    ? 'Se entregará en el próximo pulso del bot'
    : 'Entregado al bot; esperando su resultado';
}
