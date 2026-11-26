# GPU Grid

[![CI](https://github.com/luisedumh/gpu-grid/actions/workflows/ci.yml/badge.svg?branch=develop)](https://github.com/luisedumh/gpu-grid/actions/workflows/ci.yml)

Distributed GPU computing platform. Clients submit CUDA programs from the browser;
the platform compiles them and runs them on idle GPUs offered by providers.

## Repository layout

- `backend/` — REST API and job scheduler (Node.js, TypeScript, Express)
- `docker-compose.yml` — development infrastructure (PostgreSQL, Redis)

## Development setup

Requirements: Node.js (version in `.nvmrc`, use `nvm install`), Docker with Compose.

    npm install                 # root tooling (Prettier)
    docker compose up -d        # start PostgreSQL and Redis
    cd backend && npm install
    npm run dev                 # backend on http://localhost:3000
    cd frontend && npm install
    npm run dev                 # web interface on http://localhost:5173

Useful commands:

    npm run format              # format the whole repository
    docker compose down         # stop infrastructure (data is kept)
    docker compose down -v      # stop and delete all data

- `frontend/` — web interface (React, TypeScript, Vite, Tailwind)

## Continuous integration

Every push and every pull request runs `.github/workflows/ci.yml` in GitHub Actions, in two phases:

1. **Build, unit tests and smoke test**: formatting, lint, types and build of the backend,
   the frontend and the agent; their unit tests; and a smoke test that starts the built
   application and checks that it answers.
2. **Integration and end-to-end tests, and report** (only if phase 1 passed): the backend
   tests against PostgreSQL with their coverage, and the Playwright tests with the real
   `nvcc` compiler and an agent in simulation mode (GitHub has no GPU, so the `@gpu`
   test runs only on a machine with one). The summary of each run shows the result of
   every job and the coverage; the reports can be downloaded from the run.

`develop` and `main` are protected: a pull request can only be merged when every job passes.
