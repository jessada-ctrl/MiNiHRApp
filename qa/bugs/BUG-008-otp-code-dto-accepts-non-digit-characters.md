---
id: BUG-008
title: VerifyLineOtpDto.otpCode accepts any 6-character string, not just digits
severity: low
status: fixed
related_fr: FR-2.1
reported_by: qa-tester
reported_date: 2026-07-13
fixed_by: claude
fixed_date: 2026-07-13
---

## Description

FR-2.1 specifies a "รหัส OTP 6 หลัก" (6-digit OTP code), and the code itself is always generated
as digits only (`crypto.randomInt(0, 1_000_000).toString().padStart(6, '0')` in
`LineAuthService.requestOtp`). However `VerifyLineOtpDto.otpCode`
(`apps/backend/src/auth/dto/verify-line-otp.dto.ts`) only validates with
`@IsString() @Length(6, 6)`, which checks string length but not character class. Any 6-character
string — including letters or symbols — passes DTO validation and reaches the business logic.

This is not currently exploitable (a non-digit value simply fails `bcrypt.compare` against the
digit-only hash and returns the normal "Invalid OTP code" / lockout response, confirmed by
testing — no 500, no crash), but it's a validation gap relative to the spec's "6-digit" contract,
and it also means malformed input is silently treated as "just another wrong guess" rather than
being rejected up front by class-validator the way the task's validation-hardening expectations
call for (clean, explicit 400s for malformed input rather than falling through to business
logic that happens to fail safely).

## Steps to Reproduce

1. Request an OTP for any real employee, e.g.:
   ```
   curl -X POST http://localhost:3001/auth/line/request-otp -H "Content-Type: application/json" \
     -H "X-Tenant-Subdomain: testco" -d '{"employeeCode":"QA101","email":"qa101@testco.local"}'
   ```
2. Call verify-otp with a 6-character, all-letters `otpCode`:
   ```
   curl -X POST http://localhost:3001/auth/line/verify-otp -H "Content-Type: application/json" \
     -H "X-Tenant-Subdomain: testco" \
     -d '{"employeeCode":"QA101","email":"qa101@testco.local","otpCode":"abcdef","lineUserId":"Ux_alpha_test"}'
   ```
3. Observe the DTO validation passes (no `class-validator` 400 about format); the request reaches
   `LineAuthService.verifyOtp` and only fails later, at the `bcrypt.compare` step, with
   `"Invalid OTP code"`.

## Expected Result

`otpCode` should be rejected at the DTO layer with a validation error (e.g. via
`@Matches(/^\d{6}$/)`) when it contains anything other than 6 digits, consistent with the "6-digit
OTP" contract and with how `RequestLineOtpDto`/`VerifyLineOtpDto` are meant to give clean,
specific 400s for malformed input.

## Actual Result

Non-digit 6-character strings pass DTO validation and are only rejected later as a generic wrong
OTP code (or, if the OTP row happens to already be locked out/expired, as that unrelated error
instead) — not as a format-validation error.

## Suggested Area

`apps/backend/src/auth/dto/verify-line-otp.dto.ts` — add `@Matches(/^\d{6}$/)` (or similar) to the
`otpCode` field alongside the existing `@Length(6, 6)`.

## Dev Notes

Fixed in `apps/backend/src/auth/dto/verify-line-otp.dto.ts`: replaced `@IsString() @Length(6, 6)`
with `@Matches(/^\d{6}$/, { message: 'otpCode must be exactly 6 digits' })`, which enforces both
length and digit-only content in one check.

Verified via curl against the exact repro: `otpCode: "abcdef"` now returns a clean `400
{"message":["otpCode must be exactly 6 digits"]}` at the DTO layer instead of falling through to
`bcrypt.compare` and coming back as a generic "Invalid OTP code".
