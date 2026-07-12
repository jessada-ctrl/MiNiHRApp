---
title: Pre-implementation test cases — core validation & isolation flows
status: partially executed — FR-4.6 (employee audit logging), FR-4.8 (leave type/quota policy), and FR-4.1 (approval workflow builder) rows executed against live implementations as of 2026-07-12; NFR-1, FR-2.2, FR-3.2 sections remain draft/unexecuted (no application code exists yet for those areas)
derived_by: qa-tester
derived_date: 2026-07-12
updated_date: 2026-07-12
covers_fr: NFR-1, FR-2.2, FR-3.2, FR-4.1, FR-4.6, FR-4.8
---

Derived directly from `Doc/MiniHR_SRS-V1.md` before any implementation exists. Execute these once the corresponding feature lands — do not treat them as passed/failed until actually run against real code.

**Update 2026-07-12:** all 8 spec ambiguities originally flagged below were resolved in SRS v1.2. Rows and the summary section have been updated to match the now-explicit requirements — re-derive/verify against the SRS again if it changes further.

**Update 2026-07-12 (later pass):** FR-4.8 (Leave Type & Quota Policy) and FR-4.1 (Approval Workflow Builder) landed and were executed against the running app — see sections 5 and 6 below. One critical bug filed: **BUG-002** (cross-tenant employee reference accepted on `approval_workflow_steps.approverEmployeeId`, plus the same missing check causes an unhandled 500 for a bogus employee id) — this is also a concrete, reproduced instance of the general NFR-1 risk class described in section 1 below, now that a second tenant was seeded via direct SQL to actually prove it end-to-end.

## 1. NFR-1 — Strict Data Isolation (Global Query Filtering)

Spec: every backend query must be forced through a Global Context Interceptor appending `WHERE tenant_id = :current_tenant_id`, so a programmer mistake can't leak data cross-tenant. This is the highest-priority area — any failure here is critical severity by definition.

| ID | Steps | Expected Result | Status |
|---|---|---|---|
| TC-NFR1-01 | Log in as Tenant A user. Note an entity ID (e.g., `leave_request_id`) belonging to Tenant B (via seed data/DB inspection). Call the detail endpoint (e.g., `GET /api/leave-requests/{id}`) with Tenant A's session but Tenant B's ID (IDOR-style). | 403/404 — never Tenant B's record. No fields from Tenant B leaked even in error payload. |
| TC-NFR1-02 | Repeat TC-NFR1-01 against every tenant-scoped table in the ERD: `branches`, `departments`, `employees`, `leave_types`, `leave_quotas`, `leave_requests`, `approval_workflows`, `approval_workflow_steps`, `leave_approval_actions`, `attendance_qr_codes`, `attendance_logs`, `holidays`, `notification_logs`, `audit_logs`, `otp_verifications`. | Same as above for all 15 tables — no table is missed by the interceptor. |
| TC-NFR1-03 | As Tenant A Admin, request a list/report endpoint (employee list, FR-4.7 report export) with a large page size / no filters. | Response contains only Tenant A rows; never bleeds into Tenant B even under pagination edge cases (page overflow, sort-by tricks). |
| TC-NFR1-04 | Seed two tenants with employees sharing the same `employee_code` and `email` (e.g., "EMP001" / "hr@company.com" under both A and B). Attempt OTP binding (FR-2.1) as a Tenant A employee. | Binding resolves to Tenant A's employee row only; the identical code/email under Tenant B is never matched or bound. |
| TC-NFR1-05 | Access via Tenant A's subdomain but send a session/JWT issued for Tenant B (or a tampered token with `tenant_id` claim edited to A while the session was created under B). | Rejected (401/403), or context resolves strictly from the authenticated identity, not a client-controllable claim/subdomain mismatch. | **PARTIAL PASS** (2026-07-12) — only one seeded tenant (`testco`) exists so a real second-tenant token couldn't be minted through the app; instead crafted a validly-signed JWT (same `JWT_SECRET`) with `tenantId` set to a nonexistent tenant ID and sent it against `X-Tenant-Subdomain: testco`. `JwtStrategy.validate` correctly rejected it: `401 {"message":"Token does not belong to this tenant"}`. Also confirmed a well-formed-but-expired token (`ignoreExpiration: false`) and a garbage/malformed token both get generic `401 Unauthorized`. Full two-real-tenant reproduction remains a gap — see summary. |
| TC-NFR1-06 | Trigger LINE webhook payloads at Tenant A's dynamic endpoint (`/v1/webhook/line/{tenant_a_id}`) but with a `line_user_id` known to be bound to Tenant B. | Handler does not create/update any Tenant A record using Tenant B's bound user. |
| TC-NFR1-07 | Fire ~50 concurrent requests alternating between Tenant A and Tenant B sessions against the same endpoint (e.g., check leave quota). | No response ever contains the other tenant's data — rules out request-context bleed under concurrency (thread-local/global state bug class). |
| TC-NFR1-08 | As Tenant Admin (not Super Admin) of Tenant A, attempt any endpoint/report that aggregates across tenants. | Denied — only SaaS Super Admin should ever see cross-tenant aggregates. |
| TC-NFR1-09 | As Tenant A HR Admin, query `audit_logs`/`notification_logs` for another tenant's `tenant_id` via any exposed filter/search param. | No cross-tenant rows returned. |
| TC-NFR1-10 | Attempt a raw/ad-hoc query path if one exists (generic search/export accepting a free-form filter) without an explicit `tenant_id` in the request. | Interceptor still forces `tenant_id` scoping — confirms enforcement is at the DB driver layer, not per-endpoint discipline. |

**Code-review note (2026-07-12, not a filed bug — flagged per instruction, no second tenant available to reproduce):** `apps/backend/src/tenant/tenant.middleware.ts` resolves tenant identity in this order: (1) LINE webhook path segment, (2) the `X-Tenant-Subdomain` request header, (3) `Host` header subdomain. The `X-Tenant-Subdomain` header is accepted completely unconditionally — there is no `NODE_ENV`/environment gate anywhere in `tenant.middleware.ts`, `app.module.ts`, or `main.ts` restricting it to local development, even though the code comment describes it as a "local development / API testing convenience." As written, this means *any* caller in any environment (including a hypothetical production deploy) can pick which tenant's data context a request runs in simply by setting this header, regardless of the real `Host`. Once a second real tenant exists this should be re-tested as TC-NFR1-05/TC-NFR1-10 variants: does the header override the production `Host`-derived subdomain even when they disagree? If yes, this is a critical NFR-1 gap the moment the app is deployed anywhere with more than one tenant, since `JwtStrategy`'s tenant cross-check (`payload.tenantId !== requestTenantId`) only verifies the token matches whatever tenant the header claims — it can't detect that the header itself is attacker-controlled. Separately, `tenant-scoping.extension.ts` and `tenant-context.ts` (AsyncLocalStorage-based, not thread-local/global) look structurally sound: every tenant-scoped model in `TENANT_SCOPED_MODELS` gets `tenantId` injected into `where`/`data` on every operation, which should hold up under concurrency (addresses the TC-NFR1-07 bug class) as long as the resolved `tenantId` itself was trustworthy going in.

## 2. FR-2.2 — Dynamic Leave Requesting

### 2a. Over-quota checkbox

| ID | Steps | Expected Result |
|---|---|---|
| TC-FR22-01 | Employee has 5 days remaining. Request 3 days. | No warning/checkbox; submits normally. `is_over_quota=false`. |
| TC-FR22-02 | Employee has 5 days remaining. Request exactly 5 days (boundary). | NOT over-quota (5 ≤ 5, not exceeding) — no checkbox forced. |
| TC-FR22-03 | Employee has 5 days remaining. Request 6 days. | Not blocked outright. Warning + mandatory checkbox with exact text "การลาครั้งนี้เกินโควตาและยินยอมให้ HR พิจารณาหักค่าจ้าง (LWOP)". Submit disabled until checked. |
| TC-FR22-04 | From TC-FR22-03, check the box, submit. | Succeeds; `is_over_quota=true`, `lwop_acknowledged=true` persisted. |
| TC-FR22-05 | From TC-FR22-03 state, submit via direct API call bypassing the frontend, with `is_over_quota`/`lwop_acknowledged` omitted or forced false. | Backend must independently recompute over-quota status, not trust client-supplied flags. **Verify this explicitly — the FR is titled "Frontend Checkbox Validation," so backend enforcement could easily be missed.** |
| TC-FR22-06 | Employee has 2 pending (unapproved) requests totaling 3 days against a 5-day quota. Submit a new request for 3 more days. | **Resolved in SRS v1.2 (FR-2.2 Quota Calculation Rule):** remaining quota = total − approved − pending. 3 (approved-equivalent pending) + 3 (new) = 6 > 5 → over-quota checkbox IS required, re-validated server-side at submit time. |
| TC-FR22-07 | Submit hourly-duration leave crossing the lunch break window. | Lunch break auto-deducted from `total_hours`; hours→days conversion used for the over-quota check stays consistent. |
| TC-FR22-08 | Quota shows 5 days remaining at form load; a concurrent approved request consumes 4 days before this request (4 days) is submitted. | Server must re-validate quota at submit time, not just at form-load time. |

### 2b. Conditional medical-certificate attachment

| ID | Steps | Expected Result |
|---|---|---|
| TC-FR22-09 | Tenant sets sick-leave threshold = 3 days. Request 2 days. | Attachment not mandatory. |
| TC-FR22-10 | Same config. Request exactly 3 days (boundary — spec says "≥ 3 วัน", inclusive). | Attachment IS mandatory at exactly 3. **Most likely off-by-one bug spot — confirm ≥, not >.** |
| TC-FR22-11 | Same config. Request 4 days, attach a file, submit. | Succeeds; `attachment_url_enc` populated. |
| TC-FR22-12 | Same config. Request 4 days, no file, attempt submit. | Blocked client-side; backend must independently reject too (same concern as TC-FR22-05). |
| TC-FR22-13 | Request a leave type with no threshold configured (e.g., annual leave), any duration. | Attachment never mandatory. |
| TC-FR22-14 | Two separate 2-day sick-leave requests within a 30-day window (each individually under the 3-day threshold), totaling 4 days. | **Resolved in SRS v1.2 (FR-2.2 Conditional Attachment):** threshold is now evaluated on the 30-day rolling cumulative total (existing + new request), not the single request in isolation. 2 + 2 = 4 ≥ 3 → attachment IS mandatory on the second request, closing the split-request loophole. |
| TC-FR22-15 | Two tenants configure different thresholds for the same leave-type name. | Each tenant's threshold applies independently (per-`tenant_id` config, not hardcoded). |
| TC-FR22-16 | Attach a non-image/oversized file. | **Resolved in SRS v1.2 (FR-2.2 File Constraint):** only JPG/PNG/PDF accepted, max 5 MB. Reject with a clear error otherwise. |

## 3. FR-3.2 — Multi-Stage Audit Trail Review (Required Rejection Comment)

| ID | Steps | Expected Result |
|---|---|---|
| TC-FR32-01 | Approver opens LIFF Review, clicks [ปฏิเสธ] without a comment, attempts submit. | Blocked until comment entered. |
| TC-FR32-02 | Comment is whitespace-only, click Reject, submit. | Should still be blocked — trim-and-check needed, not just a naive `required` attribute. |
| TC-FR32-03 | Valid non-empty comment, Reject, submit. | Succeeds; `leave_approval_actions` row: `action='reject'`, `comment` populated, `approver_id`, `acted_at`. |
| TC-FR32-04 | Approve without a comment. | Succeeds — spec only mandates the comment for rejection, not approval. |
| TC-FR32-05 | Reject via direct API call, `comment` omitted/empty. | Backend must independently enforce "required" — the FR explicitly says "เสมอ" (always), so this is in-scope, not just UI polish. |
| TC-FR32-06 | Multi-step workflow: Step 1 approver acts, Step 2 approver opens LIFF Review. | Timeline shows Step 1's name, action, timestamp, comment — full history, not just latest action. |
| TC-FR32-07 | Step 1 approver rejects (with comment) a multi-step request. | **Resolved in SRS v1.2 (FR-3.2 Rejection Termination Rule):** rejection at any step immediately sets the whole request to "rejected" and ends the workflow — must NOT advance to the next approver. |
| TC-FR32-08 | Employee checks Leave History (FR-2.4) after rejection. | **Resolved in SRS v1.2 (FR-2.4 Rejection Reason Visibility):** the rejection comment from FR-3.2 must be shown to the employee in their leave history. |
| TC-FR32-09 | A non-assigned-approver obtains/guesses the LIFF Review deep link (e.g., forwarded Flex Message) and opens it. | Access denied/scoped correctly — ties to NFR-3 (token verification) and NFR-1 (tenant isolation); not a bare guessable ID. |
| TC-FR32-10 | Two approvers assigned to the same step act near-simultaneously (one Approve, one Reject). | Only one action accepted as authoritative; no duplicate/contradictory `leave_approval_actions` rows. |

## 4. FR-4.6 — Organization Structure & Employee Management (Permission-Change Audit Logging)

Ties to NFR-4: Immutable Audit Logs (insert-only, DB-level `UPDATE`/`DELETE` denial for the HR app role), capturing User ID, Action, Timestamp, IP Address.

| ID | Steps | Expected Result | Status |
|---|---|---|---|
| TC-FR46-01 | HR Admin changes an employee's `role` from Employee to Approver via web UI. | New `audit_logs` row: `user_id`=acting admin, `action` describing the change, `target_table='employees'`, `target_id`, `timestamp`, `ip_address` — all populated. | **PASS** (2026-07-12) — executed via `PATCH /employees/:id` `{"role":"approver"}` as `hr@testco.local`; verified row in `audit_logs` via psql with correct `user_id`, `action`, `target_table`, `target_id`, `ip_address` (`::1`), `timestamp`. |
| TC-FR46-02 | HR Admin reassigns `direct_manager_id` (reporting line) only. | **Resolved in SRS v1.2 (FR-4.6 Audit Log Scope):** manager reassignment is explicitly listed as one of the three mandatory-logged change types. Must produce an `audit_logs` row. | **PASS** (2026-07-12) — `directManagerId`-only PATCH produced its own `audit_logs` row (`employee.update — direct manager changed`). |
| TC-FR46-03 | HR Admin deactivates an employee (`status` → inactive). | **Resolved in SRS v1.2 (FR-4.6 Audit Log Scope):** activate/deactivate is explicitly listed as mandatory-logged. Must produce an `audit_logs` row. | **PASS** (2026-07-12) — `status: active → inactive` PATCH produced its own `audit_logs` row. |
| TC-FR46-04 | Using the app's own DB credentials, attempt a direct `UPDATE`/`DELETE` on an existing `audit_logs` row. | Must be rejected at the database permission level (DB-grant test, not just app-logic). | **FAIL** (2026-07-12) — see **BUG-001**: the `minihr` DB role (same role the backend connects as) has full `UPDATE`/`DELETE`/`TRUNCATE` grants on `audit_logs`; both statements succeeded against real rows. |
| TC-FR46-05 | Role change made through a reverse proxy forwarding `X-Forwarded-For`. | **Resolved in SRS v1.2 (NFR-4):** `ip_address` captured must be the real client IP; if behind a proxy, only trust `X-Forwarded-For` from a proxy the system itself controls. | Not executed — no reverse-proxy config in the local-dev topology to reproduce against; gap, not a filed bug. |
| TC-FR46-06 | Bulk-import employees via Excel/CSV (FR-4.2) where the file changes existing employees' roles in bulk. | **Resolved in SRS v1.2 (FR-4.2 Bulk Import Audit Logging):** each individual record change from a bulk import must produce its own per-record `audit_logs` row under the same FR-4.6 conditions — a single batch-level log entry is explicitly disallowed. | Not executed — FR-4.2 bulk import is not implemented yet; gap, not a filed bug. |
| TC-FR46-07 | HR Admin opens an employee's edit form and saves with no actual changes (no-op). | **Resolved in SRS v1.2 (FR-4.6):** system must diff before/after values and must NOT create a spurious log entry for a no-op save. | **PASS** (2026-07-12) — tested both a true no-op (re-sending the current `status` value) and an empty-body PATCH; neither created an `audit_logs` row, and neither response leaked `passwordHash`. |
| TC-FR46-08 | HR Admin changes a role, then immediately reverts it. | Both changes logged as separate sequential entries — append-only history, not deduped. | **PASS** (2026-07-12) — `approver→employee` then `employee→approver` produced two distinct sequential `audit_logs` rows. |
| TC-FR46-09 | Two different HR Admins change different employees' roles concurrently. | Each log entry attributes the correct `user_id` — no cross-attribution under concurrency. | Not executed — only one seeded `tenant_admin` account exists; would need a second HR Admin account to reproduce meaningfully. Gap, not a filed bug. |
| TC-FR46-10 | Tenant A's HR Admin attempts to query Tenant B's `audit_logs` via API manipulation. | Denied — ties to NFR-1; audit logs are tenant-scoped like every other table. | Not executed — only one seeded tenant (`testco`) exists in this environment, so true cross-tenant leakage can't be reproduced end-to-end. `tenant-scoping.extension.ts`/`tenant.middleware.ts` were read directly instead — see summary. Gap, not a filed bug. |
| TC-FR46-11 | Simulate an audit-log insert failure occurring at the same time as the underlying role update. | **Resolved in SRS v1.2 (NFR-4 Atomicity):** the audit-log write and the underlying change must be in the same DB transaction. If the log insert fails, the role change must roll back too — no silent unlogged permission change. | Not executed — would require fault injection (e.g. temporarily breaking the audit insert) not available via black-box API/DB testing. Source inspection confirms `EmployeesService.update` wraps both the `employee.update` and `audit.record` calls in a single `prisma.$transaction`, which is structurally correct, but this wasn't proven under an actual induced failure. Gap, not a filed bug. |

## 5. FR-4.8 — Leave Type & Quota Policy Configuration

Executed 2026-07-12 against `apps/backend/src/leave-types/` and the `updateQuotas` path in `apps/backend/src/employees/employees.service.ts`, via direct API calls (`curl`) with DB verification (`psql`), logged in as `hr@testco.local` (tenant_admin) and `approver@testco.local` (approver).

| ID | Steps | Expected Result | Status |
|---|---|---|---|
| TC-FR48-01 | Create a new leave type (`POST /leave-types`) while N employees already exist. | A `leave_quotas` row is backfilled for every existing employee, `totalDays` = the new type's `defaultQuota`. | **PASS** — created "QA Leave Type A" (`defaultQuota=12`) with 7 existing employees; `psql` confirmed exactly 7 `leave_quotas` rows, all `total_days=12.00`. |
| TC-FR48-02 | Create a new employee (`POST /employees`) while M leave types already exist. | A `leave_quotas` row is backfilled for every existing leave type, at each type's own `defaultQuota`. | **PASS** — created "QA New Employee" with 4 existing leave types; `psql` confirmed 4 rows, each matching its leave type's own `defaultQuota` (12 / 3 / 40 / 6). |
| TC-FR48-03 | Edit an existing leave type's `defaultQuota` (`PATCH /leave-types/:id`). | Already-granted `leave_quotas.total_days` for existing employees must NOT change — only future backfills use the new default. | **PASS** — changed "QA Leave Type A" `defaultQuota` 12→99; all 8 employees' existing `leave_quotas` rows for that type stayed at `12.00` after the edit. |
| TC-FR48-04 | Quota override via `PATCH /employees/:id/quotas` with a real change. | Exactly one new `audit_logs` row, `target_table='leave_quotas'`, describing the change. | **PASS** — one PATCH changing 1 of 4 submitted quota values produced exactly one new row (`employee.quota-override — QA New Employee: ลาป่วย: 40 → 20`); the 3 unchanged values in the same request did not add extra rows. |
| TC-FR48-05 | Immediately re-send the identical `PATCH /employees/:id/quotas` payload (no-op). | Zero additional `audit_logs` rows. | **PASS** — `audit_logs` count for `target_table='leave_quotas'` unchanged (2→2) after the no-op re-PATCH; HTTP 200 still returned. |
| TC-FR48-06 | Delete a leave type with zero `leave_requests` referencing it (`DELETE /leave-types/:id`). | Succeeds; the leave type and its `leave_quotas` rows are gone (cascade). | **PASS** — created and deleted a throwaway leave type; `psql` confirmed both the `leave_types` row and its `leave_quotas` rows were gone afterward. |
| TC-FR48-07 | Delete a leave type that DOES have `leave_requests` referencing it. | Per FR-4.8 ("หากมีการลบประเภทการลาที่มีคำขอลาอ้างอิงอยู่แล้ว... ระบบต้องปฏิเสธการลบ"), must be rejected with a clear error, not deleted. | **Not executed — gap, not a bug.** No leave-request-creation feature exists yet (FR-2.2 not implemented), so no real `leave_requests` row can be made to reference a leave type. Code inspection (`leave-types.service.ts:70-81`) shows a `BadRequestException` guard keyed on `leaveRequest.count({ where: { leaveTypeId: id } }) > 0`, which looks structurally correct, but this is unproven against a real referencing row — re-run this case once FR-2.2 lands. |
| TC-FR48-08 | As `approver`, attempt `POST`/`PATCH`/`DELETE /leave-types` and `PATCH /employees/:id/quotas`. | All rejected `403`; `GET /leave-types` still allowed. | **PASS** — all four write attempts returned `403`; `GET /leave-types` returned `200`. |

## 6. FR-4.1 — Drag & Drop Approval Workflow Builder

Executed 2026-07-12 against `apps/backend/src/workflows/`, via direct API calls with DB verification, same accounts as section 5.

| ID | Steps | Expected Result | Status |
|---|---|---|---|
| TC-FR41-01 | `POST /approval-workflows` with 2 valid steps (`direct_manager`, `specific_employee`). | Workflow + ordered steps created and returned, `stepOrder` 0/1. | **PASS**. |
| TC-FR41-02 | `PATCH /approval-workflows/:id/steps` — same endpoint the drag-and-drop UI calls — reorder existing steps and add a third. | Old steps replaced entirely by the new ordered list; response reflects new order/count. | **PASS** — reordered 2→3 steps (moved `specific_employee` to position 0, added a second `specific_employee` step); response and DB matched the new order. |
| TC-FR41-03 | `PATCH .../steps` again, shrinking to a single step. | Removed steps are actually gone from `approval_workflow_steps`, not just hidden. | **PASS** — `psql` confirmed exactly 1 row remained for the workflow after the PATCH. |
| TC-FR41-04 | `POST /approval-workflows` (and separately `PATCH .../steps`) with a step `approverType='specific_employee'` and `approverEmployeeId` omitted. | Clean `400`, not a `500`/raw DB error. | **PASS** — both endpoints returned `400 {"message":"approverEmployeeId is required when approverType is specific_employee"}`. |
| TC-FR41-05 | `POST /approval-workflows` (and separately `PATCH .../steps`) with `approverType='specific_employee'` and `approverEmployeeId` set to a syntactically-valid but non-existent employee id. | Clean `400` (SRS's intent per FR-4.1 is every step resolves to a real approver). | **FAIL — see BUG-002.** Both endpoints returned an unhandled `500 {"statusCode":500,"message":"Internal server error"}` (a raw Prisma FK-violation, uncaught). Transaction rollback did work correctly — no partial workflow/step was left behind either time. |
| TC-FR41-06 | `POST /approval-workflows` with `approverType='specific_employee'` and `approverEmployeeId` pointing at a real employee belonging to a **different tenant**. | Rejected — an approver must resolve to a real employee within the *same* company (ties to NFR-1). | **FAIL — CRITICAL, see BUG-002.** Seeded a second tenant + employee directly via SQL (no tenant-registration UI/API exists to do this through the app) and, logged in as `testco`'s admin, successfully created a workflow (`201`) whose step's `approverEmployeeId` points at the other tenant's employee. `psql` confirmed the step's own `tenant_id` (testco) differs from the referenced employee's real `tenant_id` (the seeded other tenant) — a persisted cross-tenant reference, and the leaked employee's `fullName` is returned in the API response to any `testco` user (including the `approver` role) who lists workflows. |
| TC-FR41-07 | `DELETE /approval-workflows/:id` on a workflow with steps. | Workflow and all its `approval_workflow_steps` rows are gone (cascade). | **PASS** — `psql` confirmed 0 rows remained in `approval_workflow_steps` for the deleted workflow's id. |
| TC-FR41-08 | As `approver`, attempt `POST`/`PATCH .../:id`/`PATCH .../:id/steps`/`DELETE /approval-workflows`. `GET` should still work. | All writes rejected `403`; `GET` returns `200`. | **PASS** — all four write attempts returned `403`; `GET /approval-workflows` returned `200` (including a request that incidentally exposed the leaked cross-tenant employee name from TC-FR41-06 — see BUG-002). |

## Cross-cutting note

Every FR above that describes validation as "Frontend Checkbox Validation" or a "required field" (over-quota checkbox, mandatory attachment, mandatory rejection comment) needs a **paired backend-enforcement test case** — client-only validation is trivially bypassable via direct API calls, and the SRS's intent (LWOP tracking, data integrity, mandatory audit trail) clearly requires server-side enforcement even where the FR wording only describes UI behavior. See TC-FR22-05, TC-FR22-12, TC-FR32-05.

## Spec ambiguities — RESOLVED in SRS v1.2 (2026-07-12)

All 8 items below were open questions when this test plan was first derived. They are now explicit requirements in `Doc/MiniHR_SRS-V1.md` v1.2 — re-verify against the SRS directly if it changes again, don't treat this list as the source of truth going forward.

1. ~~Does an over-quota calculation include *pending* leave requests?~~ → **Yes** — remaining quota = total − approved − pending, re-validated server-side at submit time (FR-2.2 Quota Calculation Rule). (TC-FR22-06)
2. ~~Is the conditional-attachment threshold per-request or cumulative?~~ → **Cumulative over a 30-day rolling window**, closing the split-request loophole (FR-2.2 Conditional Attachment). (TC-FR22-14)
3. ~~No file-type/size constraints defined.~~ → **JPG/PNG/PDF only, max 5 MB** (FR-2.2 File Constraint). (TC-FR22-16)
4. ~~Does rejection at an intermediate step terminate the whole request?~~ → **Yes, immediately** — status becomes "rejected", workflow does not advance further (FR-3.2 Rejection Termination Rule). (TC-FR32-07)
5. ~~Is the rejection comment shown to the employee?~~ → **Yes**, in FR-2.4 leave history (FR-2.4 Rejection Reason Visibility). (TC-FR32-08)
6. ~~Does FR-4.6 audit logging cover manager reassignment and deactivation?~~ → **Yes, both explicitly in scope**, alongside role changes (FR-4.6 Audit Log Scope). (TC-FR46-02, TC-FR46-03)
7. ~~Does audit logging apply to bulk-imported (FR-4.2) role changes?~~ → **Yes — per-record audit log entries required**, batch-level-only logging is explicitly disallowed (FR-4.2 Bulk Import Audit Logging). This was the most consequential gap. (TC-FR46-06)
8. ~~Must the audit-log write and the permission-change write be atomic?~~ → **Yes**, same DB transaction; if the log insert fails, the change must roll back too (NFR-4 Atomicity). (TC-FR46-11)

Also picked up while resolving the above: **NFR-4** now specifies that `ip_address` must be the real client IP, not a reverse proxy's (TC-FR46-05).
