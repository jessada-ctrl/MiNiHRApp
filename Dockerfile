# Single-VM deploy for Fly.io: builds all 3 workspace apps, runs all 3 as
# separate processes in one container (see docker-entrypoint.sh). Only the
# backend's port is exposed publicly; it proxies /liff and /admin to the
# other two internally (apps/backend/src/main.ts), matching how local dev
# shares a single tunnel origin today — no CORS, no separate domains.

FROM node:20-bookworm-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/backend/package.json apps/backend/package.json
COPY apps/web-admin/package.json apps/web-admin/package.json
COPY apps/liff-app/package.json apps/liff-app/package.json
RUN npm ci

COPY . .

RUN npx prisma generate --schema apps/backend/prisma/schema.prisma
RUN npm run build --workspace=apps/backend

# Baked into the client bundles at build time (Next.js requirement) — ARGs
# default to the active deploy target's values since Easypanel's Git-source
# app builder has no UI for passing --build-arg (checked in the 2.32.2
# dashboard: Advanced tab only exposes Ports/Replicas/Command, nothing for
# build args), so these defaults are what actually ships. Update here when
# the target domain changes; platforms that DO support build-args (DO, a
# custom CI) can still override per environment instead of editing this file.
ARG NEXT_PUBLIC_API_URL=https://lala-dev.jibsoft.co.th
ARG NEXT_PUBLIC_LIFF_ID=2010683188-c6CdKvGw
ARG NEXT_PUBLIC_TENANT_SUBDOMAIN=testco
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_LIFF_ID=$NEXT_PUBLIC_LIFF_ID
ENV NEXT_PUBLIC_TENANT_SUBDOMAIN=$NEXT_PUBLIC_TENANT_SUBDOMAIN

RUN npm run build --workspace=apps/liff-app

# Only web-admin needs the /admin basePath (see next.config.ts) — set just
# for its own build step so it doesn't leak into the liff-app build above.
RUN NEXT_BASE_PATH=/admin npm run build --workspace=apps/web-admin

FROM node:20-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3001

COPY --from=build /app /app
COPY docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

EXPOSE 3001
CMD ["/app/docker-entrypoint.sh"]
