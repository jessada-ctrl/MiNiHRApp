-- Before the attachment upload endpoint existed, the LIFF app sent a
-- placeholder string ("mock://<filename>") as the medical certificate, and it
-- was written straight into attachment_url_enc unencrypted. No file ever
-- backed those values.
--
-- They are cleared rather than migrated: there is nothing to migrate to. Left
-- in place they would be indistinguishable from a real reference at the API
-- level ("this request has a certificate") while every attempt to open one
-- failed, and each read would log a decryption warning. NULL is the honest
-- representation of "no certificate was attached".
--
-- Scoped to the exact placeholder prefix so a genuinely encrypted value
-- (base64 iv:tag:ciphertext, which never contains "://") cannot be caught.
UPDATE "leave_requests"
SET "attachment_url_enc" = NULL
WHERE "attachment_url_enc" LIKE 'mock://%';
