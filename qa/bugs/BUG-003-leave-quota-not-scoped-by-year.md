---
id: BUG-003
title: Leave quota remaining is computed by summing approved/pending days across ALL years, not the target year — quota is contaminated across year boundaries
severity: high
status: fixed
related_fr: FR-2.2
reported_by: qa-tester
reported_date: 2026-07-12
fixed_by: claude
fixed_date: 2026-07-13
---

## Description

`LeaveRequestsService.getQuotaInfo()` (`apps/backend/src/leave-requests/leave-requests.service.ts:78-98`)
looks up the quota **total** for a specific `year` (via the `employeeId_leaveTypeId_year` unique key on
`leave_quotas` — the schema itself, `prisma/schema.prisma:186-201`, models quota as explicitly per-year),
but the `used` (approved) and `pending` sums it subtracts from that total are **not** filtered by year at
all:

```ts
const [approvedAgg, pendingAgg] = await Promise.all([
  this.prisma.leaveRequest.aggregate({
    where: { employeeId, leaveTypeId, status: 'approved' },
    _sum: { totalDays: true },
  }),
  this.prisma.leaveRequest.aggregate({
    where: { employeeId, leaveTypeId, status: 'pending' },
    _sum: { totalDays: true },
  }),
]);
```

Both queries only filter by `employeeId` + `leaveTypeId` + `status` — there is no `startDatetime`/`year`
bound. So a request dated in year Y+1 (or any other year) has its "remaining quota" computed against
approved/pending leave days from **every year the employee has ever had a request in**, not just year Y+1.
This directly breaks the FR-2.2 rule ("โควตาทั้งหมด - วันลาที่อนุมัติแล้ว - วันลาที่กำลังรออนุมัติ") the moment
a company's leave data spans more than one calendar year (i.e. every real tenant, every January) —
leftover approved/pending leave from an old year permanently deflates (or, if quota rows themselves are
misconfigured, could inflate) the "remaining" figure for all future years, either wrongly blocking
legitimate low-usage requests as "over quota" or producing nonsensical negative remaining values.

Note `getCumulativeAttachmentDays()` (the FR-2.2 30-day attachment window logic, same file) does NOT have
this bug — it correctly bounds its query by `startDatetime` — so this is specific to the quota calc path,
not a symptom of the whole file being unscoped.

## Steps to Reproduce

1. Log in as the employee: `POST /auth/login`, header `X-Tenant-Subdomain: testco`, body
   `{"email":"employee1@testco.local","password":"Passw0rd!"}`. Capture `accessToken` and the employee's
   `id` (`f691853a-d35b-4bc1-bf7f-0707abbb7b41` in this environment).
2. Confirm (via `GET /leave-requests/mine` or psql) that this employee already has some approved and/or
   pending `ลาป่วย` (sick, leave type `00000000-0000-0000-0000-000000000021`) requests dated in 2026 — in
   this environment: one **approved** 2-day request (2026-07-05/06) and several **pending** requests
   totalling 6 days (2026-10-11, 2026-11-10/11, 2026-11-18/19, 2026-12-20), i.e. `used=2`, `pending=6`
   for 2026 sick leave.
3. Confirm no `leave_quotas` row exists yet for this employee/leave-type/**2028**:
   ```sql
   SELECT * FROM leave_quotas WHERE employee_id = 'f691853a-d35b-4bc1-bf7f-0707abbb7b41'
     AND leave_type_id = '00000000-0000-0000-0000-000000000021' AND year = 2028;
   -- 0 rows
   ```
4. Submit a brand-new sick-leave request dated in **2028** (a year with no quota row and no prior
   requests at all — completely unrelated to the 2026 data from step 2):
   ```
   POST /leave-requests
   X-Tenant-Subdomain: testco
   Authorization: Bearer <employee token>
   Content-Type: application/json

   {"leaveTypeId":"00000000-0000-0000-0000-000000000021","durationType":"full_day","startDate":"2028-01-10"}
   ```
5. Observe the response, then re-run the query from step 3 (still 0 rows — confirms the request was
   correctly *not persisted*, so this isn't a leftover-data artifact, purely a calculation bug).

## Expected Result

Per FR-2.2, remaining quota for the 2028 request should be `total_2028 (0, no quota row configured yet)
- approved_2028 (0) - pending_2028 (0)` = `0`. The request should be rejected as over-quota (0 remaining
< 1 day requested) *only* because no 2028 quota has been configured yet — the rejection message should
show `remaining quota (0 day(s))`, not a value contaminated by 2026 activity.

## Actual Result

```json
{"message":"This request (1 day(s)) exceeds your remaining quota (-8 day(s)). Set lwopAcknowledged=true to acknowledge LWOP and submit anyway.","error":"Bad Request","statusCode":400}
```

`remaining = -8` is exactly `0 (2028 total) - 2 (2026 approved) - 6 (2026 pending)` — the 2026 figures
leaked straight into the 2028 calculation. The employee is being penalized in a future year for leave
activity that has nothing to do with that year's quota allocation. (The inverse is also possible: an
employee who used their full 2026 quota but has an *unrelated, generously-sized* 2027 `leave_quotas` row
would still get an artificially low "remaining" for 2027 the first time they request, because the 2026
approved/pending days keep counting against them indefinitely — there is no year in which the pollution
stops, since none of the three statuses queried (`approved`, `pending`) are ever time-bounded.)

## Suggested Area

- `apps/backend/src/leave-requests/leave-requests.service.ts`, `getQuotaInfo()` (~line 78-98): both the
  `approvedAgg` and `pendingAgg` aggregate queries need a `startDatetime` (or `endDatetime`) range filter
  bounding them to the given `year` (e.g. `startDatetime: { gte: new Date(Date.UTC(year,0,1)), lt: new
  Date(Date.UTC(year+1,0,1)) }`), matching the same year the `leave_quotas` row and the `total` figure are
  scoped to.
- Worth double-checking `myQuotaSummary()` (same file, ~line 65-76) once fixed — it already threads
  `year` through to `getQuotaInfo`, so fixing the aggregate filters should fix both the quota-summary
  endpoint and the create-time re-validation in one change.

## Dev Notes

Fixed in `apps/backend/src/leave-requests/leave-requests.service.ts`, `getQuotaInfo()`: added a
`startDatetime: { gte: yearStart, lt: yearEnd }` bound (UTC year boundaries, matching the `year` param
already used for the `leave_quotas` lookup) to both the `approvedAgg` and `pendingAgg` aggregate queries.
`myQuotaSummary()` and the create-time re-validation in `create()` both call `getQuotaInfo()`, so both are
fixed by this one change.

Verified against the exact repro in this report: created a fresh 2028 sick-leave request for the same
employee/leave-type (`employee1`, `00000000-0000-0000-0000-000000000021`) with 2026 approved=2/pending=6
still in the DB. Before the fix this returned `remaining quota (-8 day(s))`; after the fix it returns
`remaining quota (0 day(s))` — exactly `0 (2028 total, no quota row) - 0 (2028 approved) - 0 (2028 pending)`,
matching the Expected Result section exactly. Backend restarted via nodemon (`--watch src`) picked up the
change automatically.
