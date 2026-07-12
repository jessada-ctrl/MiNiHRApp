---
id: BUG-004
title: Rejection comment field accepts a whitespace-only string — DTO's MinLength(1) does not trim, so " " passes validation and terminates the workflow with a blank reason
severity: medium
status: fixed
related_fr: FR-3.2
reported_by: qa-tester
reported_date: 2026-07-12
fixed_by: claude
fixed_date: 2026-07-13
---

## Description

FR-3.2 is explicit and states the rule twice in the same bullet: rejection comment "ห้ามเป็นค่าว่างหรือ
ช่องว่างล้วน (Whitespace-only)" (must not be empty **or whitespace-only**), and "Backend ต้องบังคับ
ตรวจสอบเงื่อนไขนี้ซ้ำเสมอ" (the backend must enforce this itself, not rely on the frontend).

`RejectLeaveRequestDto` (`apps/backend/src/leave-requests/dto/reject-leave-request.dto.ts`) only has:

```ts
export class RejectLeaveRequestDto {
  @IsString()
  @MinLength(1)
  comment!: string;
}
```

`class-validator`'s `@MinLength(1)` checks the raw string length and does **not** trim whitespace first.
A single space character `" "` has `length === 1`, so it satisfies `MinLength(1)` and is accepted as a
"non-empty" rejection reason, even though it conveys no actual reason. There is no `@Transform` to trim
the value, nor any custom validator checking `comment.trim().length > 0`.

This also undermines FR-2.4's "Rejection Reason Visibility" requirement — the employee's leave history is
supposed to always show a meaningful reason when a request is rejected, but here it would show a blank/
whitespace value.

## Steps to Reproduce

1. Log in as the approver: `POST /auth/login`, header `X-Tenant-Subdomain: testco`, body
   `{"email":"approver@testco.local","password":"Passw0rd!"}`. Capture `accessToken`.
2. As the employee (`employee1@testco.local` / `Passw0rd!`), create a pending leave request whose current
   step's approver is this approver (any fresh request via `POST /leave-requests` works — the default
   workflow's step 0 is `direct_manager`, and `employee1`'s direct manager is `approver@testco.local` in
   this environment). Note the returned request `id`.
3. As the approver, reject it with a single-space comment:
   ```
   POST /leave-requests/<id>/reject
   X-Tenant-Subdomain: testco
   Authorization: Bearer <approver token>
   Content-Type: application/json

   {"comment":" "}
   ```
4. Observe the response is `201` (request rejected), not a `400` validation error.
5. Confirm via psql that the whitespace comment was persisted as-is:
   ```sql
   SELECT request_id, action, comment FROM leave_approval_actions WHERE request_id = '<id>';
   -- action = 'reject', comment = ' '
   ```

Reproduced concretely in this environment against request `611e4d86-61e2-4497-ab63-f5e8a36933cf`
(a `ลาพักร้อน`/annual request): `POST /leave-requests/611e4d86-61e2-4497-ab63-f5e8a36933cf/reject` with
body `{"comment":" "}` returned `201` with `"status":"rejected"`, and the corresponding
`leave_approval_actions` row has `comment = ' '` (a single space), not a validation error.

## Expected Result

Per FR-3.2, a whitespace-only comment must be rejected by the backend with a `400 Bad Request` (e.g.
"comment must not be empty or whitespace-only"), the same as an empty string `""` already is. The request
should remain `pending` and no `leave_approval_actions` row should be written.

## Actual Result

`201 Created` — the request transitions straight to `rejected`, `currentApproverId` is nulled, and a
`leave_approval_actions` row is written with `comment = ' '` (visually indistinguishable from "no reason
given" when shown to the employee on their history page per FR-2.4).

## Suggested Area

- `apps/backend/src/leave-requests/dto/reject-leave-request.dto.ts` — add a `@Transform(({ value }) =>
  typeof value === 'string' ? value.trim() : value)` before `@MinLength(1)` (so the length check runs
  against the trimmed value and the stored comment doesn't retain leading/trailing whitespace either), or
  add a custom validator that checks `comment.trim().length > 0` directly. Either approach also fixes the
  case of a comment that is *only* leading/trailing whitespace around real text (e.g. `"  ok  "` currently
  gets stored un-trimmed).

## Dev Notes

Fixed in `apps/backend/src/leave-requests/dto/reject-leave-request.dto.ts`: added a `@Transform` that trims
the string before `@MinLength(1)` runs, plus an explicit validation message. The global `ValidationPipe`
already has `transform: true` set (`apps/backend/src/main.ts`), so the transform applies before validation.

Verified against the exact repro in this report: `POST /leave-requests/:id/reject` with `{"comment":" "}`
now returns `400 {"message":["comment must not be empty or whitespace-only"]}` instead of `201`. Also
verified the case noted in Suggested Area — a comment with real text surrounded by whitespace
(`"  ไม่อนุมัติ ติดงานด่วน  "`) is accepted (`201`, request transitions to `rejected`) and the *trimmed*
value is what gets persisted — confirmed via `leave_approval_actions.comment` in psql
(`ไม่อนุมัติ ติดงานด่วน`, length 21, no leading/trailing whitespace). Backend restarted via nodemon
(`--watch src`) picked up the change automatically.
