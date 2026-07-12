---
id: BUG-006
title: Department create/update with branchId set to an empty string ("") bypasses branch-existence validation and crashes with an unhandled 500 instead of a clean 400
severity: medium
status: fixed
related_fr: FR-4.6
reported_by: qa-tester
reported_date: 2026-07-13
fixed_by: claude
fixed_date: 2026-07-13
---

## Description

`OrgService.createDepartment()` and `OrgService.updateDepartment()` (`apps/backend/src/org/org.service.ts`)
both guard the branch-existence/tenant-ownership lookup with a plain truthy check:

```ts
if (dto.branchId) {
  const branch = await this.prisma.branch.findUnique({ where: { id: dto.branchId }, select: { id: true } });
  if (!branch) throw new BadRequestException('branchId does not refer to a valid branch in this company');
}
```

(`createDepartment`: lines 83-86; `updateDepartment`: lines 93-96.)

`CreateDepartmentDto.branchId` / `UpdateDepartmentDto.branchId` are only decorated with
`@IsOptional() @IsString()` — there is no `@IsUUID()` or `@IsNotEmpty()` — so an empty string
`""` passes DTO validation. But `if (dto.branchId)` is **falsy for `""`**, so the branch lookup
is skipped entirely, and `""` is written straight into the `create`/`update` call's `data`. This
then hits Postgres's `departments_branch_id_fkey` foreign-key constraint (no branch has id
`""`), which Nest's default exception filter surfaces as a raw, unhandled `500 Internal Server
Error` instead of the intended `400 Bad Request`.

This is the same validation-gap class already flagged in `qa/bugs/BUG-002-workflow-step-approver-employee-id-not-validated.md`
("worth checking on any other DTO that accepts a bare foreign-key id referencing a tenant-scoped
model from client input") — here the check exists (unlike BUG-002's original missing check) but
uses `if (x)` where `x !== undefined` was needed, so the falsy-but-defined value `""` slips past
it. No cross-tenant data leak results (the DB layer's own FK constraint saves it, and both the
`create()` call and the `$transaction` in `updateDepartment()` correctly leave no row/partial
write behind — verified via psql before/after), but the API contract is broken: a well-formed
request produces an opaque, undebuggable 500 instead of a validation 400.

## Steps to Reproduce

1. Log in as `hr@testco.local` (tenant_admin): `POST http://localhost:3001/auth/login` with
   header `X-Tenant-Subdomain: testco`, body `{"email":"hr@testco.local","password":"Passw0rd!"}`.
   Capture `accessToken`.
2. Create a department with `branchId` explicitly set to an empty string:
   ```
   POST http://localhost:3001/departments
   X-Tenant-Subdomain: testco
   Authorization: Bearer <token from step 1>
   Content-Type: application/json

   {"departmentName":"QA-Empty-BranchId-Dept","branchId":""}
   ```
3. Observe the response is `500 {"statusCode":500,"message":"Internal server error"}`, not a
   `400` with a validation message.
4. Confirm no row was written: `docker compose exec -T db psql -U minihr -d minihr -c "SELECT * FROM departments WHERE department_name = 'QA-Empty-BranchId-Dept';"` returns 0 rows (create is a
   single atomic insert, so this particular case doesn't leave a partial write).
5. Repeat against an existing department's update endpoint to show the same bug on the PATCH
   path:
   ```
   PATCH http://localhost:3001/departments/<any existing department id>
   X-Tenant-Subdomain: testco
   Authorization: Bearer <token from step 1>
   Content-Type: application/json

   {"branchId":""}
   ```
   Same `500` response. Confirm via psql that the department's `branch_id` column is unchanged
   afterward (the `$transaction` correctly rolls back — no partial write either).

## Expected Result

A `400 Bad Request` with a message such as "branchId does not refer to a valid branch in this
company" (the same message already returned for a non-existent or cross-tenant branch id),
consistent with FR-4.6's department/branch CRUD validation and with how every other invalid
`branchId` value (non-existent UUID, cross-tenant UUID, malformed non-UUID string like
`"not-a-uuid"`) is already correctly handled by this same code path.

## Actual Result

Both `POST /departments` and `PATCH /departments/:id` return a raw, unhandled:
```
HTTP 500
{"statusCode":500,"message":"Internal server error"}
```
when `branchId` is an empty string, because `if (dto.branchId)` treats `""` the same as
`undefined` ("don't touch this field" / "no branch") and skips the existence check, letting the
empty string reach the Postgres foreign-key constraint, whose violation is not caught anywhere
in `OrgService`.

For contrast, everything else tested around this same validation passed correctly in this
session: latitude/longitude/radiusMeters range and type validation on branch create (`400` for
lat=200, lng=-500, radiusMeters=0/-5/50.5, correct acceptance at boundary lat=90/lng=180);
partial `PATCH {"isActive": false}` on a branch correctly leaves `latitude`/`longitude`/
`radiusMeters` untouched; audit logging only fires on genuine `isActive` transitions (toggle off
→ 1 row, name-only edit → 0 rows, full no-op PATCH → 0 rows, toggle back on → a second row with
a `branch.activate — ...` action string) with no phantom rows; a non-existent or cross-tenant
`branchId` (verified using a second tenant `qaother`, id `99999999-0000-0000-0000-000000000001`,
and a branch seeded under it for this test) is correctly rejected with `400` on both create and
update, with no row leaked/written either way; `branchId: null` on `PATCH /departments/:id`
correctly detaches the department from its branch; deactivating a branch/department with
employees still assigned correctly leaves those employees' `branchId`/`departmentId` untouched
(soft flag only, no cascade); RBAC is correctly enforced (`tenant_admin` only for POST/PATCH,
`tenant_admin`+`approver` for GET, `employee` gets `403` on GET, no token gets `401`); and
`GET /organization` on the web-admin frontend returns `200` with no compile-error overlay.

## Suggested Area

- `apps/backend/src/org/org.service.ts` — `createDepartment()` (~line 83) and
  `updateDepartment()` (~line 93): change `if (dto.branchId)` to `if (dto.branchId !== undefined && dto.branchId !== null)` (or equivalent) so an empty string is treated as "provided, must be
  validated" rather than "not provided."
- `apps/backend/src/org/dto/create-department.dto.ts` and
  `apps/backend/src/org/dto/update-department.dto.ts` — consider adding `@IsUUID()` (or at least
  `@IsNotEmpty()` alongside the existing `@IsOptional()`) to `branchId` so this class of malformed
  input is rejected at the DTO layer before it ever reaches the service/DB, which would also
  close this gap without relying on the service's truthy check being exactly right.

## Dev Notes

Fixed at both layers suggested in the report:

1. `apps/backend/src/org/dto/create-department.dto.ts` and `update-department.dto.ts`: replaced the bare
   `@IsString()` on `branchId` with a format check that rejects empty/malformed values before the request
   ever reaches `OrgService`. Initially tried `@IsUUID()` as literally suggested, but that turned out to be
   its own regression: `class-validator`'s `@IsUUID()` enforces the RFC4122 version nibble (1-8) or the
   exact all-zero/all-`f` sentinels — it rejects this codebase's own seed fixture ids like
   `00000000-0000-0000-0000-000000000001` (version nibble `0`), which are exactly the ids real requests
   need to reference (confirmed by trying to restore a department's branch link to that seeded id and
   getting `400 branchId must be a UUID` from my own fix). Switched to a loose UUID-*shaped* regex
   (`@Matches(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)`) instead — rejects `""`
   and garbage like `"not-a-uuid"` just as well, but accepts both real `@default(uuid())` v4 ids and the
   readable seed fixture ids. `@IsOptional()` still lets `null`/`undefined` through untouched (`null` = the
   existing detach behavior on `PATCH`, `undefined` = "field not present in the request").
2. `apps/backend/src/org/org.service.ts` — `createDepartment()`/`updateDepartment()`: changed
   `if (dto.branchId)` to `if (dto.branchId !== undefined && dto.branchId !== null && dto.branchId !== '')`
   as defense-in-depth, per the report's first suggested fix (the DTO layer now closes the gap before this
   ever runs, but the truthy-check bug itself is still worth not having lying around).

Verified via curl against the exact repro in this report: `branchId: ""` on both `POST /departments` and
`PATCH /departments/:id` now returns a clean `400 branchId must be a valid id` instead of a `500`. Also
re-verified the two cases the fix could plausibly have broken: `branchId: null` on `PATCH` still detaches
correctly (`branchId` becomes `null` in the response), and `branchId` set to the pre-existing seeded branch
id `00000000-0000-0000-0000-000000000001` (used to restore `ฝ่ายขาย`'s branch link after testing) now
succeeds — this last case is the one that would have silently broken had `@IsUUID()` been kept as originally
suggested, since it's indistinguishable from a real request until tested against actual seed data.
