---
id: BUG-007
title: verify-otp error messages leak whether an employeeCode+email pair is valid, defeating the anti-enumeration design of request-otp
severity: high
status: fixed
related_fr: FR-2.1
reported_by: qa-tester
reported_date: 2026-07-13
fixed_by: claude
fixed_date: 2026-07-13
---

## Description

`POST /auth/line/request-otp` is correctly designed to be enumeration-safe: it always returns
the same generic message and only creates an `otp_verifications` row when the employeeCode+email
pair actually matches an active employee in the current tenant (confirmed by testing — see
BUG-007 is filed specifically about the *second* step of the flow).

However, `POST /auth/line/verify-otp` (in `LineAuthService.verifyOtp`,
`apps/backend/src/auth/line-auth.service.ts`) throws three **different** `BadRequestException`
messages depending on internal state:

1. `'Invalid employee code, email, or OTP'` — thrown when `employee` lookup returns nothing,
   **or** when no matching `otpVerification` row exists (lines 81 and 87).
2. `'OTP has expired — please request a new one'` — thrown when a matching (but expired) OTP
   row exists (line 88).
3. `'Invalid OTP code'` — thrown when a matching, non-expired OTP row exists but the submitted
   code is wrong (line 96).

Because `request-otp` only ever creates an `otp_verifications` row for a *real* matching
employeeCode+email pair, an attacker can trivially recover exactly the enumeration signal that
`request-otp`'s generic-message design is supposed to prevent, using this two-call sequence:

1. `POST /auth/line/request-otp` with a candidate `employeeCode`/`email` pair (always returns
   the same generic success message — no signal here).
2. Immediately `POST /auth/line/verify-otp` with the same pair and any throwaway 6-digit code.
   - If the pair was **invalid**, no OTP row was created in step 1, so `verify-otp` returns
     message 1 (`'Invalid employee code, email, or OTP'`).
   - If the pair was **valid**, an OTP row *was* created in step 1, so `verify-otp` returns
     either message 2 or message 3 — categorically different text/response shape from message 1.

This lets an attacker enumerate valid employeeCode+email combinations (e.g. to build a target
list for phishing, or to know which OTP-guessing attempts are even worth spending against the
5-attempt lockout) without ever needing access to the real OTP email. It directly undermines the
security intent documented in `requestOtp`'s own comment: "Always returns the same generic
message ... so this endpoint can't be used to enumerate valid employeeCode/email pairs" — that
guarantee only holds for `request-otp` in isolation, not for the two-endpoint flow as a whole.

## Steps to Reproduce

1. Start backend, use tenant header `X-Tenant-Subdomain: testco`.
2. Call `POST /auth/line/verify-otp` with a definitely-nonexistent pair, never having called
   `request-otp` for it first:
   ```
   curl -X POST http://localhost:3001/auth/line/verify-otp -H "Content-Type: application/json" \
     -H "X-Tenant-Subdomain: testco" \
     -d '{"employeeCode":"NOPE999","email":"nope@testco.local","otpCode":"123456","lineUserId":"Ux_probe_1"}'
   ```
   Result: `{"message":"Invalid employee code, email, or OTP", ...}`.
3. Call `POST /auth/line/request-otp` for a **real** employeeCode+email pair (e.g.
   `EMP004`/`hr@testco.local`), then immediately call `verify-otp` for the same pair with a
   throwaway wrong code:
   ```
   curl -X POST http://localhost:3001/auth/line/request-otp -H "Content-Type: application/json" \
     -H "X-Tenant-Subdomain: testco" -d '{"employeeCode":"EMP004","email":"hr@testco.local"}'
   curl -X POST http://localhost:3001/auth/line/verify-otp -H "Content-Type: application/json" \
     -H "X-Tenant-Subdomain: testco" \
     -d '{"employeeCode":"EMP004","email":"hr@testco.local","otpCode":"111111","lineUserId":"Ux_probe_3"}'
   ```
   Result: `{"message":"Invalid OTP code", ...}` — a different message than step 2, even though
   the attacker supplied a wrong code in both cases.
4. Compare the two responses: message text (and, in a real deployment, likely response timing,
   since the valid-pair path does an extra DB round trip and a bcrypt compare that the
   invalid-pair path skips entirely) reliably distinguishes "pair is valid" from "pair is
   invalid" — the exact enumeration `request-otp` is designed to prevent.

## Expected Result

`verify-otp` should return an equally generic error (e.g. always
`'Invalid employee code, email, or OTP'` regardless of *which* part — employee match, OTP
existence, OTP expiry, or OTP correctness — actually failed), so the enumeration protection
`request-otp` implements isn't bypassable by calling `verify-otp` afterward. Distinct messages
for expiry vs. wrong-code vs. no-employee are useful for legitimate users mid-flow, but only if
they can't be reached by an attacker who was never sent the real OTP in the first place — e.g.
expiry/attempt-specific detail could be shown only when the request additionally proves
knowledge of a previously-issued code fragment, or the whole endpoint could rate-limit/generalize
responses so the message alone isn't a reliable oracle.

## Actual Result

Three distinguishable `BadRequestException` messages are returned depending on internal
database state (employee match / OTP row existence / OTP expiry / OTP correctness), letting an
attacker who controls both `request-otp` and `verify-otp` calls reliably determine whether a
candidate employeeCode+email pair is valid, without ever seeing the real OTP.

## Suggested Area

`apps/backend/src/auth/line-auth.service.ts` — `verifyOtp()`, lines 78-97 (the three distinct
`BadRequestException` call sites).

## Dev Notes

Fixed by restructuring both endpoints in `apps/backend/src/auth/line-auth.service.ts` so that OTP
row existence/state no longer correlates with whether employeeCode+email is real:

1. `requestOtp()` now creates an `otp_verifications` row for **every** employeeCode+email pair,
   real or not (`employeeId: employee?.id ?? null` — the column was already nullable). Only the
   mock email send is skipped for a non-match; row creation and all subsequent attempts/expiry
   behavior are identical either way.
2. `verifyOtp()` now looks up the OTP row **first** and runs all of its own checks (found?
   attempts exhausted? expired? code correct?) before ever touching the `employee` table. The
   real-employee lookup only happens *after* a correct code match — reachable for a fake pair only
   by guessing the exact 6-digit code, a ~1-in-1,000,000 chance capped at 5 tries before lockout,
   which is the accepted residual risk any OTP scheme runs on (not a distinguishable error path).

Verified via curl against the exact repro in this report, plus the real-vs-fake comparison the
report describes: a pair that never had `request-otp` called returns the generic message; a
**fake** pair that did have `request-otp` called first, then a wrong-code `verify-otp`, now
returns the identical `"Invalid OTP code"` a **real** pair returns for the same wrong-code
sequence — no message-content signal left to distinguish them. Re-verified the legitimate
happy-path bind (real employeeCode+email, correct code) still works and issues a JWT correctly —
no regression from moving the employee lookup later in the function.
