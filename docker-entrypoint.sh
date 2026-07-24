#!/bin/bash
# Starts all three apps in one container (single Render web service, see
# Dockerfile). Only the backend's port is exposed publicly — it proxies
# /liff and /admin to the other two internally (see apps/backend/src/main.ts).
set -e

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
