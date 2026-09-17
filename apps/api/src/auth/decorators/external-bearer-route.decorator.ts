import { SetMetadata } from '@nestjs/common';

export const EXTERNAL_BEARER_ROUTE_METADATA = 'auth:external-bearer-route';

/** Marks a route authenticated by a dedicated Bearer guard, not a web cookie. */
export const ExternalBearerRoute = (): MethodDecorator & ClassDecorator =>
  SetMetadata(EXTERNAL_BEARER_ROUTE_METADATA, true);
