#!/bin/bash
# Starts all three apps in one container (single Render web service, see
# Dockerfile). Only the backend's port is exposed publicly — it proxies
# /liff and /admin to the other two internally (see apps/backend/src/main.ts).
set -e

# Fail fast on config that is optional in development but load-bearing once
# real customers are on the system. Each of these fails *quietly* if missing
# — a well-known encryption key, OTP emails that go to stdout, certificates
# written to a layer that disappears on redeploy — so the failure would only
# surface as "nobody can log in" or "the file I uploaded last week is gone".
missing=""
[ -z "$DATABASE_URL" ] && missing="$missing DATABASE_URL"
[ -z "$JWT_SECRET" ] && missing="$missing JWT_SECRET"
[ -z "$TENANT_CRED_ENCRYPTION_KEY" ] && missing="$missing TENANT_CRED_ENCRYPTION_KEY"
[ -z "$SMTP_HOST" ] && missing="$missing SMTP_HOST"
[ -z "$ATTACHMENTS_DIR" ] && missing="$missing ATTACHMENTS_DIR"
if [ -n "$missing" ]; then
  echo "FATAL: missing required environment variable(s):$missing" >&2
  echo "See .env.example for what each one is and how to generate it." >&2
  exit 1
fi

# ATTACHMENTS_DIR must be a mounted volume, not a path inside the image.
# Medical certificates written to the container's own filesystem are lost on
# the next deploy, with no error at the time it happens — by the time anyone
# notices, the files are unrecoverable. `mountpoint` answers this directly.
mkdir -p "$ATTACHMENTS_DIR"
if ! mountpoint -q "$ATTACHMENTS_DIR"; then
  echo "FATAL: ATTACHMENTS_DIR ($ATTACHMENTS_DIR) is not a mounted volume." >&2
  echo "Leave-request attachments stored there would be destroyed on the next deploy." >&2
  echo "Attach a persistent volume at that path, or set ALLOW_EPHEMERAL_ATTACHMENTS=true to override (test environments only)." >&2
  [ "$ALLOW_EPHEMERAL_ATTACHMENTS" = "true" ] || exit 1
  echo "WARNING: continuing with ephemeral attachment storage because ALLOW_EPHEMERAL_ATTACHMENTS=true." >&2
fi

# Run migrations before starting the app — folded in here (rather than a
# platform-specific "release command" feature) so this entrypoint works the
# same regardless of which host runs the container.
npx prisma migrate deploy --schema apps/backend/prisma/schema.prisma

node apps/backend/dist/main.js &
# NEXT_BASE_PATH must be set here too, not just at build time (Dockerfile) —
# next.config.ts reads it fresh on every `next start`, and without it Next
# thinks there's no basePath and 404s every route under /admin.
(cd apps/web-admin && NEXT_BASE_PATH=/admin npx next start -p 3000) &
(cd apps/liff-app && npx next start -p 3002) &

# If any one of the three dies, exit so Fly restarts the whole machine
# rather than silently running in a half-working state.
wait -n
exit $?
