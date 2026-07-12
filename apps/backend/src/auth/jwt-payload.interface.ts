export interface JwtPayload {
  sub: string; // employee id
  tenantId: string;
  role: 'employee' | 'approver' | 'tenant_admin';
  email: string;
}

export interface AuthenticatedUser {
  id: string;
  tenantId: string;
  role: 'employee' | 'approver' | 'tenant_admin';
  email: string;
  fullName: string;
}
