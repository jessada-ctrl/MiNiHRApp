// Deliberately separate from auth/jwt-payload.interface.ts's JwtPayload —
// a SaaS Super Admin is platform-level, not tenant-scoped, and has no
// employee `role` enum. Mixing the two shapes would make it easy to
// accidentally accept a tenant employee's token on a platform route or
// vice versa.
export interface SaasAdminJwtPayload {
  sub: string; // SaasAdmin id
  email: string;
}

export interface AuthenticatedSaasAdmin {
  id: string;
  email: string;
  name: string;
}
