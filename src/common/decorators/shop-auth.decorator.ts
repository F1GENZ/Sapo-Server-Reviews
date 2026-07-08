import { SetMetadata } from '@nestjs/common';

export const ALLOW_EXPIRED_SAPO_TOKEN = Symbol('ALLOW_EXPIRED_SAPO_TOKEN');

export const AllowExpiredSapoToken = (): MethodDecorator & ClassDecorator =>
  SetMetadata(ALLOW_EXPIRED_SAPO_TOKEN, true);
