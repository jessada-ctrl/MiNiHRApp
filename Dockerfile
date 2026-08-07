# Single-VM deploy for Fly.io: builds all 3 workspace apps, runs all 3 as
# separate processes in one container (see docker-entrypoint.sh). Only the
# backend's port is exposed publicly; it proxies /liff and /admin to the
# other two internally (apps/backend/src/main.ts), matching how local dev
# shares a single tunnel origin today — no CORS, no separate domains.

FROM node:20-bookworm-slim AS build
WORKDIR /app

# node:*-bookworm-slim doesn't ship the openssl CLI, only the bare libssl3
# runtime lib — Prisma's engine-selection script shells out to `openssl
# version` to pick the right query engine binary, so without it present it
# silently falls back to guessing "openssl-1.1.x" (wrong for bookworm, which
# is OpenSSL 3.x) instead of failing loudly. Installing it here makes that
# detection actually correct rather than a lucky-so-far guess.
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY apps/backend/package.json apps/backend/package.json
COPY apps/web-admin/package.json apps/web-admin/package.json
COPY apps/liff-app/package.json apps/liff-app/package.json
RUN npm ci

COPY . .

RUN npx prisma generate --schema apps/backend/prisma/schema.prisma
RUN npm run build --workspace=apps/backend

# No NEXT_PUBLIC_* values are set here on purpose.
#
# `next build` inlines them into the client bundles, so anything tenant-
# specific baked in at this point would pin the resulting image to exactly one
# customer — previously this file hardcoded testco's domain, LIFF id and
# subdomain, which is why one image could only ever serve one tenant.
#
# With them unset, both apps resolve everything at runtime instead:
#  - API base URL  -> empty, i.e. root-relative to whichever tenant subdomain
#                     the browser is on (this same container serves it)
#  - tenant        -> the Host header / window.location.hostname
#  - LIFF id       -> GET /tenant/public-config, per tenant, from the DB
# See apps/web-admin/src/lib/api.ts and apps/liff-app/src/lib/liff.ts.
RUN npm run build --workspace=apps/liff-app

# Only web-admin needs the /admin basePath (see next.config.ts) — set just
# for its own build step so it doesn't leak into the liff-app build above.
RUN NEXT_BASE_PATH=/admin npm run build --workspace=apps/web-admin

FROM node:20-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3001

# Needed again here, not just in the build stage — docker-entrypoint.sh runs
# `prisma migrate deploy` in THIS container at boot, which does its own
# OpenSSL detection independent of whatever engine binary `prisma generate`
# already picked at build time.
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

COPY --from=build /app /app
COPY docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

EXPOSE 3001
CMD ["/app/docker-entrypoint.sh"]
