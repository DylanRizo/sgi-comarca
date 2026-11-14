import type {
  MarketplaceBotCommandPayload,
  MarketplaceBotInstanceView,
} from '@sgi/contracts';

/** What every section of the monitor receives from the page. */
export type MonitorSectionProps = {
  /** Non-empty while a command is being sent; every control is disabled. */
  busy: string;
  /** Only `integrations.manage` may queue or cancel commands. */
  canControl: boolean;
  instance: MarketplaceBotInstanceView;
  onCancelCommand: (commandId: string) => Promise<void>;
  onSendCommand: (
    instance: MarketplaceBotInstanceView,
    command: MarketplaceBotCommandPayload,
    successMessage: string,
  ) => Promise<void>;
};
