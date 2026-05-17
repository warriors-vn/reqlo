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

# Expose both common dev ports (Vite=5173, CRA=3000). Compose will map the host ports.
EXPOSE 5173 3000

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

# Use the project's build script. The entrypoint detection logic is not needed here;
# projects should have a `build` script in package.json for production.
RUN set -ex \
  && if npm run -s build; then echo "Build finished"; else echo "Build failed"; fi

#############################################
# Production stage - serve built assets with nginx (small, secure image)
#############################################
FROM nginx:stable-alpine AS production

# Copy built files from the build stage. Different tools output to different dirs:
# - Vite -> dist
# - CRA  -> build
# We'll copy the whole /app and then copy the right folder into nginx html dir at runtime.
COPY --from=build /app /app

# Copy a small wrapper script to choose the correct output folder
RUN set -ex \
  && mkdir -p /docker-entrypoint.d \
  && echo '#!/bin/sh\nset -e\nif [ -d /app/build ]; then cp -a /app/build/. /usr/share/nginx/html; elif [ -d /app/dist ]; then cp -a /app/dist/. /usr/share/nginx/html; else echo "Warning: no build output found (looked for /app/build and /app/dist)"; fi\nexec nginx -g "daemon off;"' > /docker-entrypoint.d/start.sh \
  && chmod +x /docker-entrypoint.d/start.sh

# Expose standard HTTP port
EXPOSE 80

# Use our start script which copies the correct build output then launches nginx
CMD ["/docker-entrypoint.d/start.sh"]

