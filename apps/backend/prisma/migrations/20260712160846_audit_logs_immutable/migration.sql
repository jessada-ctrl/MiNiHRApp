-- NFR-4 / BUG-001: audit_logs must be immutable at the DATABASE level, not
-- just by application code only ever calling INSERT. The app's runtime role
-- and the migration-owner role are the same single Postgres user in this
-- project (see docker-compose.yml), so a REVOKE UPDATE/DELETE grant isn't
-- viable without splitting into two roles. A trigger that unconditionally
-- rejects UPDATE/DELETE works regardless of which role is connected and
-- can't be bypassed by raw SQL using the app's own credentials.

CREATE OR REPLACE FUNCTION prevent_audit_log_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is immutable (NFR-4) — % is not permitted on this table', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_logs_no_update
  BEFORE UPDATE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_mutation();

CREATE TRIGGER audit_logs_no_delete
  BEFORE DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_mutation();