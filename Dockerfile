# Multi-stage Dockerfile for a React frontend (Vite or Create React App)
# - Uses the official Node LTS image
# - Optimizes layer caching by copying only lock/package files before installing
# - Provides a `dev` target for local development (hot reload) and a `production` target
# - An entrypoint script detects Vite vs CRA and runs the appropriate commands

# Use Docker's newer syntax for possible buildkit features
# syntax=docker/dockerfile:1

#############################################
# Base stage - install dependencies (cached)
#############################################
FROM node:lts AS base
WORKDIR /app

# Always set a safe default node env (override in docker-compose or at runtime)
ENV NODE_ENV=development

# Copy package manifests first to leverage Docker layer caching for npm install
# Support package-lock.json, yarn.lock and pnpm-lock.yaml (copy with wildcard to avoid failures)
COPY package.json package-lock.json* yarn.lock* pnpm-lock.yaml* ./

# Install dependencies (use npm ci if lockfile present; otherwise fallback to npm install)
RUN set -ex \
  && if [ -f package-lock.json ]; then npm ci --prefer-offline --no-audit --no-fund; \
     else npm install --no-audit --no-fund; fi

#############################################
# Development stage - optimized for local dev with hot reload
#############################################
FROM base AS dev

# This project's Vite config (@lovable.dev/vite-tanstack-config) hardcodes the dev
# server to port 8080 (strictPort), overriding the Vite default of 5173.
EXPOSE 8080

# Copy entrypoint (detection script) and give it executable bit at build time
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Copy the rest of the source. In docker-compose we will mount the local source over /app
COPY . /app

# Default command: run dev mode (entrypoint will auto-detect framework)
CMD ["/usr/local/bin/docker-entrypoint.sh", "dev"]

#############################################
# Build stage - produce production-ready static assets
#############################################
FROM base AS build
ENV NODE_ENV=production

# Copy full source and build
COPY . /app

# build:node (not plain `build`) is what produces a self-contained deployment:
# TanStack Start's SPA mode prerenders dist/client/_shell.html, and the step
# also bundles the /api/proxy handler plus the tiny Node server that serves
# both. The default `build` target emits a Cloudflare Worker bundle with no
# static HTML document at all, which is why the previous nginx-based image
# served nothing at "/".
#
# Deliberately NOT wrapped in `if ... then ... else echo "Build failed"; fi`
# as it used to be: that swallowed a failing build and shipped a broken image
# as if nothing had gone wrong.
RUN npm run build:node

#############################################
# Production stage - reqlo's own Node server (static client + /api/proxy)
#############################################
FROM node:lts-alpine AS production
ENV NODE_ENV=production
WORKDIR /app

# Only the build output is needed at runtime — the server is dependency-free,
# so no node_modules ship in this image.
COPY --from=build /app/dist ./dist

# Matches the dev target and the docker-compose default.
ENV PORT=8080
EXPOSE 8080

# Don't run as root.
USER node

CMD ["node", "dist/static-server.mjs"]

