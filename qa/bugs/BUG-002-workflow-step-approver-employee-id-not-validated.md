---
id: BUG-002
title: approverEmployeeId on approval-workflow steps is never validated to exist/belong to the tenant — cross-tenant employee can be wired in as an approver, and a bogus ID crashes with a raw 500
severity: critical
status: fixed
related_fr: NFR-1
reported_by: qa-tester
reported_date: 2026-07-12
fixed_by: dev (Claude)
fixed_date: 2026-07-12
---

## Description

`WorkflowsService.validateSteps()` (`apps/backend/src/workflows/workflows.service.ts`) only
checks that `approverEmployeeId` is *present* when `approverType === 'specific_employee'`
(`workflows.service.ts:25-31`). It never checks that the referenced employee actually exists,
nor — critically — that the employee belongs to the current tenant, before `create()` /
`updateSteps()` persist the step (`workflows.service.ts:42-49`, `:85-93`).

This produces two distinct symptoms from the same missing check:

1. **Cross-tenant data leakage (NFR-1).** `approverEmployeeId` is a raw client-supplied string
   written straight into `ApprovalWorkflowStep.approverEmployeeId`. The Postgres FK
   (`approval_workflow_steps_approver_employee_id_fkey` → `employees.id`) only checks that
   *some* employee row with that id exists anywhere in the table — it does not check tenant
   match, and the tenant-scoping Prisma extension (`apps/backend/src/tenant/tenant-scoping.extension.ts`)
   only auto-injects `tenant_id` into the `ApprovalWorkflowStep` row being written; it does
   **not** validate that a *foreign-key value pointing into another tenant-scoped model*
   (`Employee`) actually belongs to the current tenant. Result: Tenant A's `tenant_admin` can
   set Tenant B's employee as an approver on Tenant A's workflow, and the API happily returns
   (and persists) that other tenant's employee `id` + `fullName` inside Tenant A's workflow
   response — exactly the "โปรแกรมเมอร์เขียนโค้ดพลาดจนเกิดข้อมูลรั่วไหลระหว่างบริษัท" scenario NFR-1's
   Global Context Interceptor is supposed to make impossible by construction.
2. **Unhandled 500 for a bogus/non-existent employee id.** When `approverEmployeeId` is a
   syntactically-valid but non-existent id (same tenant or not), the Postgres FK constraint
   correctly rejects the `INSERT`, but nothing in `WorkflowsService` catches that — Nest's
   default exception filter turns the raw Prisma `P2003` foreign-key-violation error into a
   generic `500 Internal Server Error` with no useful message, instead of the clean `400` the
   SRS's validation intent (FR-4.1: every step must resolve to a real approver) calls for.

Note: the transaction wrapping (`$transaction` in both `create()` and `updateSteps()`) does
correctly roll back on the 500 case — no partially-written workflow/steps were left behind in
either repro below. The severity here is the cross-tenant leak (symptom 1); symptom 2 alone
would only be `medium`.

## Steps to Reproduce

**Symptom 1 — cross-tenant approver leak:**

1. Seed a second tenant + employee directly in Postgres (there's no tenant-registration UI/API
   yet to do this through the app):
   ```sql
   INSERT INTO tenants (id, company_name, subdomain, subscription_status, created_at, updated_at)
   VALUES ('99999999-0000-0000-0000-000000000001', 'QA Other Co', 'qaother', 'trial', now(), now());
   INSERT INTO employees (id, tenant_id, employee_code, full_name, email, role, status, created_at, updated_at)
   VALUES ('99999999-0000-0000-0000-000000000002', '99999999-0000-0000-0000-000000000001', 'OTH001', 'Other Tenant Employee', 'other@qaother.local', 'employee', 'active', now(), now());
   ```
2. Log in as Tenant A's admin: `POST /auth/login` with header `X-Tenant-Subdomain: testco`,
   body `{"email":"hr@testco.local","password":"Passw0rd!"}`. Capture `accessToken`.
3. As that user, create a workflow referencing Tenant B's employee as a specific-employee
   approver:
   ```
   POST /approval-workflows
   X-Tenant-Subdomain: testco
   Authorization: Bearer <token from step 2>
   Content-Type: application/json

   {"name":"QA Cross Tenant Workflow","scopeType":"global",
    "steps":[{"approverType":"specific_employee","approverEmployeeId":"99999999-0000-0000-0000-000000000002"}]}
   ```
4. Observe the response and confirm via psql:
   ```sql
   SELECT aws.tenant_id, aws.approver_employee_id, e.tenant_id AS approver_tenant_id
   FROM approval_workflow_steps aws JOIN employees e ON e.id = aws.approver_employee_id
   WHERE aws.approver_employee_id = '99999999-0000-0000-0000-000000000002';
   ```

**Symptom 2 — unhandled 500 for a non-existent employee id:**

1. Log in as `hr@testco.local` as above.
2. `POST /approval-workflows` with
   `{"name":"QA Dangling Workflow","scopeType":"global","steps":[{"approverType":"specific_employee","approverEmployeeId":"00000000-0000-0000-0000-000000000999"}]}`
   (an id that doesn't exist in `employees` at all).
3. Same crash reproduces via `PATCH /approval-workflows/:id/steps` on an existing workflow.

## Expected Result

- Symptom 1: the API should reject step 3 with a `400 Bad Request` (e.g. "approverEmployeeId
  does not refer to a valid employee in this company") — Tenant A must never be able to read or
  write a reference to Tenant B's employee data, per NFR-1.
- Symptom 2: same — a non-existent `approverEmployeeId` should produce a clean `400`, not a
  `500`.

## Actual Result

Symptom 1: `POST /approval-workflows` returned `201 Created`:
```json
{"id":"e6997903-ff91-428c-b054-7ca9215694f0","tenantId":"61f213b8-fc3b-411b-8ee2-786db5c99962",
 "name":"QA Cross Tenant Workflow","scopeType":"global","scopeId":null,
 "steps":[{"id":"816ebab3-71b6-483a-8d06-22fe788d5cf2",
   "tenantId":"61f213b8-fc3b-411b-8ee2-786db5c99962",
   "workflowId":"e6997903-ff91-428c-b054-7ca9215694f0","stepOrder":0,
   "approverType":"specific_employee",
   "approverEmployeeId":"99999999-0000-0000-0000-000000000002",
   "approverEmployee":{"id":"99999999-0000-0000-0000-000000000002","fullName":"Other Tenant Employee"}}]}
```
The psql check confirms the row's own `tenant_id` is Tenant A (`61f213b8-...`) while the
referenced `approver_employee_id`'s real `tenant_id` is Tenant B (`99999999-...-001`) — a
persisted cross-tenant reference. `GET /approval-workflows` as Tenant A (including as the
`approver` role) also then returns Tenant B's employee's `fullName` embedded in the response.

Symptom 2: `POST /approval-workflows` with the non-existent id returned:
```
HTTP 500
{"statusCode":500,"message":"Internal server error"}
```
Reproduced identically via `PATCH /approval-workflows/:id/steps` on an existing workflow (steps
were correctly left untouched afterward — no partial write — but the caller still gets an
opaque 500 instead of actionable validation feedback).

## Suggested Area

- `apps/backend/src/workflows/workflows.service.ts` — `validateSteps()` only checks presence,
  not existence/tenant-ownership. Should look up
  `tx.employee.findMany({ where: { id: { in: [...specificEmployeeIds] } } })` (via the
  tenant-scoped `TENANT_PRISMA` client, so it's automatically filtered to the current tenant by
  `tenant-scoping.extension.ts`) and throw a `BadRequestException` for any id that doesn't come
  back, before `create()`/`updateSteps()` write anything. This one lookup fixes both symptoms:
  a cross-tenant id simply won't be found under the tenant-scoped query, and neither will a
  wholly bogus id.
- Same pattern is worth checking on any other DTO that accepts a bare foreign-key id referencing
  a tenant-scoped model from client input (e.g. `directManagerId` on `UpdateEmployeeDto`,
  `departmentId`/`branchId` on `CreateEmployeeDto`) — not verified as part of this pass, flagging
  as a class of risk rather than a confirmed second instance.

## Dev Notes

Fixed exactly as suggested: `WorkflowsService.validateSteps()` now looks up all `specific_employee` approver ids in one `this.prisma.employee.findMany({ where: { id: { in: ids } } } })` call through the tenant-scoped client before `create()`/`updateSteps()` write anything — a cross-tenant or nonexistent id just doesn't come back, and the missing ones are reported in one `BadRequestException`. Both symptoms share the same root cause and this one check closes both.

Verified against your exact repro steps:
- Symptom 1 (cross-tenant employee `99999999-...-002`): now `400` with `"approverEmployeeId does not refer to a valid employee in this company: 99999999-0000-0000-0000-000000000002"`, not `201`.
- Symptom 2 (bogus id `...-999`): now the same clean `400`, not a raw `500`.
- Sanity check: a real same-tenant employee as `specific_employee` approver still creates the workflow successfully (`201`).

Also fixed the same vulnerability class you flagged as worth checking, all in `employees.service.ts`:
- `CreateEmployeeDto.departmentId` / `.branchId`
- `UpdateEmployeeDto.departmentId` / `.branchId` / `.directManagerId`
- `updateQuotas()`'s `leaveTypeId` (per-employee quota override — a cross-tenant/bogus leave type id was equally unvalidated)

Same pattern: look the id up through the tenant-scoped client first, throw `BadRequestException` if it doesn't resolve. Verified each with a cross-tenant/bogus id (all now `400`) and confirmed a legitimate same-tenant update still succeeds (`200`).

Did not find or fix a third instance beyond these two files — `CreateLeaveRequestDto.leaveTypeId` (in `leave-requests.service.ts`) was already safe, since it was already looked up via `this.prisma.leaveType.findUnique` (the tenant-scoped client) and throws `NotFoundException` if not found in the current tenant.
