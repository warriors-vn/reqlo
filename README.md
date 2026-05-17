# reqlo 🚀

A local-first, developer-friendly HTTP client built with React, Vite and TanStack tooling. Designed for composing, executing and inspecting HTTP requests with a rich UI (request builder, cURL import, history, environments, response viewer, and AI assistant integrations).

[![Framework: React](https://img.shields.io/badge/React-19.x-61DAFB?logo=react&logoColor=white)](https://reactjs.org)
[![Build: Vite](https://img.shields.io/badge/Bundler-Vite-646cff?logo=vite&logoColor=white)](https://vitejs.dev)
[![License](https://img.shields.io/badge/License-ADD%20LICENSE-lightgrey)](#license)

## Quick Start

Get the app running locally (recommended):

1. Clone

```bash
git clone https://your.git.host/your-org/reqlo.git
cd reqlo
```

2. Install dependencies

```bash
npm ci
# or `npm install` if you don't have a lockfile
```

3. Run the dev server

```bash
npm run dev
# open http://localhost:5173
```

Or run with Docker (recommended for reproducible dev environment)

```bash
# build & run dev container (maps port 5173 by default)
docker-compose up --build

# production build image
docker build --target build -t reqlo:build .
docker build -t reqlo:prod .
```

## Project Highlights

- Local-first HTTP client with a full request builder (headers, query params, body editor — JSON, raw, form-data, GraphQL, binary)
- Request history persisted in IndexedDB using Dexie
- Import cURL, save requests to collections, and reuse via workspaces/environments
- Execute requests in-browser (fetch-based executor) with response viewer (headers, body, binary preview)
- Environment templating ({{VAR}}) and environment switcher
- Monaco code editor and advanced body editors (GraphQL, text, binary)
- Command palette, keyboard shortcuts and AI assistant panel (UI + integrations)
- Docker-first development and multi-stage production build (nginx)
- Optional Cloudflare Workers deploy via Wrangler (ssr entry present)

## Screenshots / Demo

<!-- Add screenshots or GIFs here -->
![App screenshot - Request Builder](./docs/screenshot-request-builder.png)
![App screenshot - Response Viewer](./docs/screenshot-response-viewer.png)
![Demo GIF](./docs/demo.gif)

## Features

Major features discovered in the codebase:

- Request Builder: method, URL, query params, headers, body (json/raw/xml/form-data/x-www-form-urlencoded/binary/graphql)
- Response Viewer: status, headers, body, timing, size, and error handling
- History & Collections: persistent history entries, pin/favorite, snapshots
- Environments: keyed variables, templating ({{VAR}}) applied at execution time
- Import & Export: cURL import service (src/services/curl.ts), portability helpers
- Editor integrations: Monaco editor, GraphQL editor, and specialized body editors
- Command system: command palette, fuzzy search and shortcuts
- Stores & persistence: Zustand stores for UI state + Dexie indexedDB for persistent data
- Networking: executor service handles templating, auth (basic/bearer/api-key), and body serialization
- AI Assistant & other UI panels: AIAssistantPanel, Settings, Sidebar, TabBar, etc.

## Tech Stack

| Layer | Tools / Libraries |
|---|---|
| Frontend framework | React 19, TypeScript |
| Router | @tanstack/react-router |
| Data fetching / cache | @tanstack/react-query |
| State management | zustand (local UI state), Dexie (IndexedDB for persistence) |
| Editor | monaco-editor / @monaco-editor/react |
| UI primitives | Radix UI, Tailwind CSS, custom components (src/components/ui) |
| Styling | Tailwind CSS, class-variance-authority, clsx |
| Charts & animation | recharts, framer-motion |
| Build tool | Vite (with vite-tsconfig-paths) |
| Lint & format | ESLint, Prettier |
| Bundler plugin | @cloudflare/vite-plugin (cloudflare worker support) |
| Containerization | Docker, docker-compose |
| Deploy targets | Static via nginx, Cloudflare Workers (wrangler) |

## Project Structure

Key folders and files:

- `src/`
  - `components/` — top-level UI components (RequestBuilder, ResponseViewer, CommandPalette, Sidebar, AIAssistantPanel)
  - `features/` — feature-specific code (request-body editors, request-history, utilities)
  - `services/` — cross-cutting services (curl import, db/Dexie, executor for sending requests, portability)
  - `stores/` — global stores (Zustand) and local store hooks
  - `routes/` — application routes and SSR entry points
  - `start.ts` / `server.ts` / `router.tsx` — app boot / SSR glue

## Installation (detailed)

Clone and install

```bash
git clone <repo>
cd reqlo
npm ci
```

Development (local)

```bash
npm run dev
# open http://localhost:5173
```

Development (Docker)

```bash
docker-compose up --build
# The compose maps FRONTEND_PORT (default 5173) and 3000
```

Production build (static assets)

```bash
npm run build
# preview locally
npm run preview

# or use the multi-stage Dockerfile to build and serve via nginx
docker build --target build -t reqlo:build .
docker build -t reqlo:prod .
docker run --rm -p 80:80 reqlo:prod
```

## Environment Variables

The repository provides Docker and entrypoint scripts that refer to several environment variables. Table below documents the ones found in the repo and how they're used.

| Variable | Default | Purpose |
|---|---:|---|
| NODE_ENV | development | Node environment; used by Dockerfile and scripts to toggle dev vs prod build/runtime |
| FRONTEND_TOOL | auto | docker-entrypoint auto-detects project tool (vite | cra) — set to override detection |
| HOST | 0.0.0.0 | Host binding for dev servers so the container is reachable from host |
| FRONTEND_PORT | 5173 | Dev server port mapping (Vite default) |
| CHOKIDAR_USEPOLLING | false | Optional: enable polling-based file watching (helpful on macOS/WSL) |
| BROWSER | (none) | Used in CRA dev runs (BROWSER=none prevents auto-opening) — set as needed |

If you plan to deploy the SSR entry to Cloudflare Workers, see `wrangler.jsonc` — additional envs for Wrangler (account id, api token) are required when publishing.

## Available Scripts

All npm scripts from `package.json`:

| Script | What it does |
|---|---|
| `npm run dev` | Starts Vite dev server (HMR) |
| `npm run build` | Creates a production build via Vite |
| `npm run build:dev` | Build with development mode (vite build --mode development) |
| `npm run preview` | Serves the production build locally using vite preview |
| `npm run lint` | Runs ESLint across the project |
| `npm run format` | Runs Prettier to format code |

## Docker Support

This project includes a multi-stage Dockerfile and a convenience `docker-compose.yml` to run the app in a containerized dev environment.

- Dockerfile targets:
  - `base` — installs dependencies
  - `dev` — copies source, exposes dev ports, and runs `docker-entrypoint.sh dev` (auto-detects Vite/CRA)
  - `build` — runs `npm run build` and outputs artifacts
  - `production` — nginx stage which copies `build`/`dist` and serves via nginx

Common commands

```bash
docker-compose up --build

# Build production image
docker build --target build -t reqlo:build .
docker build -t reqlo:prod .
docker run --rm -p 80:80 reqlo:prod
```

## API / Integration

- `executor` (src/services/executor.ts): in-browser request executor using fetch. It resolves environment templates (`{{VAR}}`), applies auth (basic/bearer/api-key), serializes body types and returns a structured ExecutionResult.
- `curl` import service (src/services/curl.ts): parse cURL into a saved request (import modal integrates this).
- DB (src/services/db.ts): Dexie-based schema for workspaces, collections, requests, history, environments. Seeds sample data on first run.
- Cloudflare Workers: `src/server.ts` and `wrangler.jsonc` provide an SSR entrypoint for deploying to Workers via Wrangler.

## Usage

1. Create or select a workspace (UI default 'Personal')
2. Use the request builder to compose a request — set method, URL, headers, query params
3. Add request body using the specialized editors (JSON, GraphQL, form-data, raw, binary)
4. Choose an environment or define variables and reference them as `{{VAR_NAME}}` in URL/headers/body
5. Execute the request and inspect the response in the Response Viewer
6. Save requests to collections and revisit them later from the sidebar or history panel

## Development Guide

Coding conventions & patterns used in this repo:

- TypeScript first: all code is TypeScript and follows strict typing where practical.
- React & component architecture: components live under `src/components/` with smaller feature components under `src/features/`.
- State management: short-lived UI state uses Zustand stores (`src/stores` / feature stores). Persistent data is stored in IndexedDB via Dexie (`src/services/db.ts`).
- Data fetching: @tanstack/react-query is used for server/cache friendly queries where applicable.
- API layer pattern: `src/services/*` contains pure helpers for executing requests, parsing cURL, and interacting with storage — components consume these services via hooks/stores.
- Styling: Tailwind CSS utility classes + small design-system primitives under `src/components/ui` (Radix primitives + CVA patterns).

## Build & Production

Production build (static):

```bash
npm run build
```

The Dockerfile includes a `production` stage that uses nginx to serve either `/app/dist` (Vite) or `/app/build` (CRA). Use the multi-stage build to create a small runtime image.

### Cloudflare Workers (SSR)

This project includes a server entry built for `@tanstack/react-start` and a `wrangler.jsonc` configuration. To deploy the SSR entry to Cloudflare Workers you will need to configure Wrangler (account id, API token) and run:

```bash
# install wrangler globally or use npx
npx wrangler publish
```

## Performance Optimizations

- Vite provides fast dev server and ES module-based code splitting in production builds.
- App uses lightweight primitives and memoization patterns; code editors (Monaco) are loaded as dedicated bundles to avoid inflating the main bundle.
- Dexie (IndexedDB) keeps persistence local and fast; large binary payloads are handled by streaming / blob patterns in the UI.

## Security

- Auth handling: executor applies Basic, Bearer and API key headers at request time; tokens are kept in local DB and never transmitted to remote telemetry by this codebase.
- Environment variables used as templates (`{{VAR}}`) are resolved only on the client before sending requests — avoid storing secrets in public repos. Consider a secure vault for team-shared sensitive values.
- Docker images explicitly set NODE_ENV and recommend not enabling dangerous flags in production. For production deployments remove dev-only sources and enable secure headers on the static server.

## Roadmap

- Add OAuth flows / secure secrets vault (optional integration with HashiCorp/1Password/vaul)
- Add import/export for full workspace/collection JSON (CLI + UI)
- Add request chaining and test assertions to create lightweight API tests
- Add SSR-rendered landing/demo and example environments for onboarding

## Contributing

We welcome contributions. Suggested workflow:

1. Fork the repo and create a feature branch: `feat/<short-description>` or `fix/<short-description>`
2. Follow Conventional Commits for messages (feat/fix/chore/docs)
3. Open a PR with a clear description and screenshots if the change touches UI
4. Tests & linting: run `npm run lint` and `npm run format` before opening a PR

Branch naming and commit conventions

- Branches: `feat/*`, `fix/*`, `chore/*`, `docs/*`, `refactor/*`
- Commit messages: Conventional Commits (e.g., `feat(request): add graphql editor support`)

## License

No LICENSE file detected in the repository. If you want to open-source this project, add a license file (MIT is a common choice).

If you'd like, I can add a ready-to-commit MIT `LICENSE` file and a minimal `CONTRIBUTING.md`.

## Acknowledgements

This project uses a number of high-quality open-source libraries — thanks to the maintainers of React, Vite, TanStack libraries, Radix UI, Tailwind CSS, Dexie and Monaco.

If you want, I can also:

- Add a ready-to-commit `LICENSE` file (MIT) to this repository
- Generate a short `CONTRIBUTING.md` with PR template and checklist
- Add GitHub Actions workflow for lint/build and Docker image build

Enjoy working with reqlo! 🎯

