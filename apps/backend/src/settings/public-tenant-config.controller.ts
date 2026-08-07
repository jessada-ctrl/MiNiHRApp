import { Controller, Get } from '@nestjs/common';
import { SettingsService } from './settings.service';

/**
 * The one endpoint both front-end apps may call before anyone has logged in.
 *
 * Everything a browser needs to know about *which* tenant it is talking to
 * used to be baked into the JS bundle at `next build` time
 * (NEXT_PUBLIC_TENANT_SUBDOMAIN / NEXT_PUBLIC_LIFF_ID), which meant one built
 * image could only ever serve one customer — the opposite of what the rest of
 * the system is designed for. Those values are served from here instead, so a
 * single deployed image serves every tenant and each browser gets the config
 * for whichever subdomain it actually arrived on (TenantMiddleware resolves
 * that from the Host header before this handler runs).
 *
 * Deliberately unauthenticated: the LIFF app needs the LIFF id *in order to*
 * log in, so requiring a token here would be circular. Nothing returned is
 * secret — the company name and subdomain are visible on the login page
 * anyway, and a LIFF id is public by design (it ships in the URL LINE opens).
 * The channel secret and access token are NOT here and must never be.
 */
@Controller('tenant/public-config')
export class PublicTenantConfigController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  getPublicConfig() {
    return this.settings.getPublicTenantConfig();
  }
}
