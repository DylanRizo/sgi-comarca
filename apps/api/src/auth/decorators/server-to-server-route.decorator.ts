import { SetMetadata } from '@nestjs/common';

export const SERVER_TO_SERVER_ROUTE_METADATA = 'auth:server-to-server-route';

/**
 * Allows a request without a browser Origin while preserving exact Host
 * validation. The route must provide its own non-cookie authentication.
 */
export const ServerToServerRoute = (): MethodDecorator & ClassDecorator =>
  SetMetadata(SERVER_TO_SERVER_ROUTE_METADATA, true);
