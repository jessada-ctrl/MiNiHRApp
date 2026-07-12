---
id: BUG-005
title: Bulk import CSV has no leave-quota column — FR-4.8's "custom value in the import file overrides the default" requirement is unimplemented
severity: medium
status: fixed
related_fr: FR-4.2
reported_by: qa-tester
reported_date: 2026-07-13
fixed_by: claude
fixed_date: 2026-07-13
---

## Description

FR-4.2 states the bulk-import feature must support importing "ข้อมูลพนักงานและโควตาวันลาเริ่มต้น" (employee data **and** starting/default leave quota) via CSV/Excel upload. FR-4.8 is explicit that the company-wide standard quota "ต้องถูกใช้เป็นค่าเริ่มต้นเมื่อเพิ่มพนักงานใหม่ (FR-4.6) หรือนำเข้าพนักงานผ่าน Bulk Import (FR-4.2) **หากไฟล์นำเข้าไม่ได้ระบุค่าเฉพาะเจาะจงมาด้วย**" — i.e. the default is only used *if the import file doesn't specify a particular value*, which presupposes the import file CAN specify a particular per-employee quota value.

The current `bulkImport()` implementation and its CSV schema have no quota-related column at all. `csv.util.ts`/`employees.service.ts` only recognize: `employeeCode, fullName, email, phone, department, branch, position, role, status, directManagerEmployeeCode`. New employees always receive exactly `leaveType.defaultQuota` for every leave type (verified in DB — see Steps below), with no way to override it per employee from the file. There is also no path to update an existing employee's quota via bulk import at all — the only quota-override mechanism in the codebase is the separate `PATCH /employees/:id/quotas` endpoint, entirely disconnected from the import flow, so a bulk-import-driven quota change (which FR-4.2's audit-logging paragraph explicitly calls out as an example: "เปลี่ยน Role, สายบังคับบัญชา, สถานะการทำงาน, **โควตาวันลา**") can never happen and can therefore never be audited either.

## Steps to Reproduce

1. Log in as tenant_admin (`hr@testco.local` / `Passw0rd!`), header `X-Tenant-Subdomain: testco`.
2. POST to `/employees/bulk-import` with:
   ```
   employeeCode,fullName,email
   QA-IMP-010,ทดสอบ,qa.imp010@testco.local
   ```
3. Query `GET /employees/:id/quotas` for the created employee (or inspect `leave_quotas` directly: `docker compose exec -T db psql -U minihr -d minihr -c "SELECT leave_type_id, total_days FROM leave_quotas WHERE employee_id='<id>'"`).
4. Observe every row's `totalDays` equals the leave type's company-wide `defaultQuota` — there is no CSV column that could have produced a different value, and adding an arbitrary extra column (e.g. `annualLeaveQuota`) to the CSV has no effect since `parseCsv`/`bulkImport()` never reads it.

## Expected Result

Per FR-4.8, the import file should be able to specify a specific/custom leave-quota value for an employee that takes precedence over the leave type's company default when present, falling back to the default only when the file omits it. A resulting quota change on an *existing* employee via re-import should also produce a per-record audit_logs entry, consistent with how role/manager/status changes are already handled in `bulkImport()`.

## Actual Result

No quota column exists in the CSV schema, DTO, or parser. `bulkImport()` (apps/backend/src/employees/employees.service.ts, the `create` branch around lines 317–347) unconditionally seeds `leaveType.defaultQuota` for new employees and never touches `leave_quotas` for the `existing`/`updated` branch at all — confirmed by code inspection and by the DB query above.

## Suggested Area

- `apps/backend/src/employees/employees.service.ts` — `bulkImport()`
- `apps/backend/src/employees/csv.util.ts` — header schema is fixed to the columns listed above
- `apps/backend/src/employees/dto/bulk-import-employees.dto.ts`
- `apps/web-admin/src/app/employees/page.tsx` — `CSV_TEMPLATE` / help text would also need updating once a quota column is added

## Dev Notes

Fixed in `apps/backend/src/employees/employees.service.ts`, `bulkImport()`: added support for one optional
`quota:<leave type name>` column per leave type configured for the tenant (columns are read dynamically
from the already-fetched `leaveTypes` list, so no CSV schema/DTO change was needed — `csv.util.ts`'s parser
already returns arbitrary header names as object keys). A non-empty cell overrides that leave type's
`defaultQuota` for the row's employee; an empty/missing cell keeps the existing default-fallback behavior.
Non-numeric or negative values produce a clean per-row error (`quota:<name> must be a non-negative number`)
rather than silently coercing to 0 or crashing.

For an **existing** employee (update path), a changed quota value is upserted into `leave_quotas` for the
current year and appended to the same per-employee `changes` list that already drives the role/status/
audit call — so a quota override is now covered by the exact same single combined `employee.bulk-import`
audit row per affected employee (not a separate entry), and an unchanged quota value writes nothing.

Also updated the web-admin bulk-import UI (`apps/web-admin/src/app/employees/page.tsx`) to fetch the
tenant's leave types and list the available `quota:<name>` columns in the modal's help text, and to include
them (pre-filled with each type's current default) in the downloadable CSV template.

Verified via curl + direct `leave_quotas`/`audit_logs` inspection: (1) a new employee imported with
`quota:ลาพักร้อน=15,quota:ลาป่วย=50` got exactly those values while the untouched `ลากิจ`/`QA Leave Type A`
quotas fell back to their company defaults; (2) re-importing the same employee with only `quota:ลาพักร้อน`
changed (15→20, sick left at 50) wrote exactly one audit row — `quota ลาพักร้อน: 15 → 20` — with no entry for
the unchanged sick-leave value; (3) re-uploading the identical CSV a third time was a clean no-op
(`unchanged`, audit row count stayed at 1); (4) a non-numeric quota cell (`quota:ลาพักร้อน=not-a-number`)
produced a clean per-row 201-with-error-array response, not a 500 or a corrupted quota row.
