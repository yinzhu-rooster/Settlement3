FROM node:20-slim AS base
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

# --------------------------------------------------------------------------
# Install dependencies
# --------------------------------------------------------------------------
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/
COPY packages/client/package.json packages/client/
RUN pnpm install --frozen-lockfile

# --------------------------------------------------------------------------
# Copy source and build
# --------------------------------------------------------------------------
COPY tsconfig.base.json ./
COPY turbo.json ./

COPY packages/shared/ packages/shared/
RUN pnpm --filter=@settlement3/shared build

COPY packages/client/ packages/client/
RUN pnpm --filter=@settlement3/client build

COPY packages/server/ packages/server/
RUN pnpm --filter=@settlement3/server build

# --------------------------------------------------------------------------
# Production image — only runtime deps
# --------------------------------------------------------------------------
FROM node:20-slim AS production
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/

RUN pnpm install --frozen-lockfile --prod

# Copy built artifacts
COPY --from=base /app/packages/shared/dist/ packages/shared/dist/
COPY --from=base /app/packages/server/dist/ packages/server/dist/
COPY --from=base /app/packages/client/dist/ packages/client/dist/

ENV NODE_ENV=production
EXPOSE 3001

CMD ["node", "packages/server/dist/index.js"]
