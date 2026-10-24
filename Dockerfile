# syntax=docker/dockerfile:1
# atlas-frontend image (ATLAS-001 FR-58, F-09): Next.js standalone output, non-root, nothing pushed.
# NEXT_PUBLIC_* values are public configuration compiled into the bundle at build time (never secrets).
#   docker build --build-arg NEXT_PUBLIC_ATLAS_API_BASE_URL=http://127.0.0.1:8100 \
#                --build-arg NEXT_PUBLIC_ATLAS_FRONTEND_SHA="$(git rev-parse HEAD)" -t atlas-web .

ARG NODE_IMAGE=node:24.22.1-trixie-slim@sha256:43b9ba1142b8dcf33fa8f922ca1be85714adc444e0586c7cf7726daaeabc1bea

# ---- build: pinned pnpm (Corepack, hash-verified) and a frozen lockfile ----
FROM ${NODE_IMAGE} AS build
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0 NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
RUN corepack enable pnpm
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN pnpm install --frozen-lockfile
COPY next.config.ts tsconfig.json postcss.config.mjs ./
COPY public ./public
COPY src ./src
ARG NEXT_PUBLIC_ATLAS_API_BASE_URL
ARG NEXT_PUBLIC_ATLAS_FRONTEND_SHA=unknown
ENV NEXT_PUBLIC_ATLAS_API_BASE_URL=${NEXT_PUBLIC_ATLAS_API_BASE_URL} \
    NEXT_PUBLIC_ATLAS_FRONTEND_SHA=${NEXT_PUBLIC_ATLAS_FRONTEND_SHA}
RUN pnpm build

# ---- runtime: standalone server only; package managers removed; unprivileged user ----
FROM ${NODE_IMAGE} AS runtime
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
           /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /opt/yarn* /usr/local/bin/yarn /usr/local/bin/yarnpkg \
    && groupadd --system --gid 10001 atlas \
    && useradd --system --uid 10001 --gid atlas --no-create-home --home-dir /nonexistent --shell /usr/sbin/nologin atlas
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
USER 10001:10001
EXPOSE 3000
STOPSIGNAL SIGTERM
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 \
    CMD ["node", "-e", "fetch('http://127.0.0.1:3000/').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"]
CMD ["node", "server.js"]
