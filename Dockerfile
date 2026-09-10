# Multi-stage production image for the school timetable app.
#
#   docker build -t school-timetable .
#   docker compose up -d        # db + migrations + app
#
# Stages:
#   deps     — install all dependencies from the lockfile (xlsx comes from the
#              SheetJS CDN tarball pinned in package.json).
#   builder  — production build (Next.js standalone output). The generated
#              Prisma client (src/generated/prisma-fresh) is committed, so no
#              `prisma generate` step is needed.
#   migrate  — one-shot: applies prisma/migrations with `prisma migrate deploy`
#              (needs the prisma CLI, hence from the builder stage).
#   runner   — standalone server only: .next-fresh/standalone + static assets
#              + public/. No node_modules install at runtime.

# ---------------------------------------------------------------- deps -------
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ------------------------------------------------------------- builder -------
FROM node:22-alpine AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
# Dummy values so `next build` can prerender pages that read env at build
# time; real values are injected at runtime (standalone server.js reads env).
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ------------------------------------------------------------- migrate -------
# One-shot service (docker compose runs it once before the app). Uses the
# builder image because `prisma` CLI + tsx are devDependencies.
FROM builder AS migrate
CMD ["npx", "prisma", "migrate", "deploy"]

# -------------------------------------------------------------- runner -------
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000

# Non-root user (node:22-alpine ships with the `node` user, uid 1000).
USER node

# Standalone server + traced runtime files.
COPY --from=builder --chown=node:node /app/.next-fresh/standalone ./
# Static chunks + public assets are NOT traced into standalone — copy them in
# (docs: node_modules/next/dist/docs .../output.md) so server.js serves them.
COPY --from=builder --chown=node:node /app/.next-fresh/static ./.next-fresh/static
COPY --from=builder --chown=node:node /app/public ./public

EXPOSE 3000
# /dang-nhap is the cheapest page that proves the Next server itself is up.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:3000/dang-nhap || exit 1

CMD ["node", "server.js"]
