export interface JwtPayload {
  sub: string; // employee id
  tenantId: string;
  role: 'employee' | 'approver' | 'tenant_admin';
  email: string;
  /**
   * Issued-at, in whole seconds — added by @nestjs/jwt on sign, so it is
   * always present on a real token even though nothing sets it explicitly.
   * JwtStrategy compares it against the employee's `passwordChangedAt` to
   * cut off sessions that predate a password change.
   */
  iat?: number;
}

export interface AuthenticatedUser {
  id: string;
  tenantId: string;
  role: 'employee' | 'approver' | 'tenant_admin';
  email: string;
  fullName: string;
  /**
   * True while the account is still on a password HR generated (a new
   * account, or an admin reset). The front-ends route the user to a
   * change-password screen until it clears.
   */
  mustChangePassword: boolean;
}
