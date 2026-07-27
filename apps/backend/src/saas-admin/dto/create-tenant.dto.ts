import { IsString, Matches, MinLength } from 'class-validator';

// FR-1.1: Tenant Onboarding & Subdomain Routing — the subdomain becomes
// https://{subdomain}.lala.io, so it must be URL/host-safe: lowercase
// letters, digits, and internal hyphens only, no leading/trailing hyphen.
const SUBDOMAIN_PATTERN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;

export class CreateTenantDto {
  @IsString()
  @MinLength(1)
  companyName!: string;

  @IsString()
  @Matches(SUBDOMAIN_PATTERN, {
    message: 'subdomain must contain only lowercase letters, digits, and internal hyphens',
  })
  subdomain!: string;
}
