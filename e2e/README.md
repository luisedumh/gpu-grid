# End-to-end tests

Tests with [Playwright](https://playwright.dev) that use GPU Grid like a person would:
a real browser opens the web, signs up, submits CUDA jobs and follows them.

## Before running them

- PostgreSQL running (`docker compose up -d` in the root of the repository).
- The compiler image built (`docker build -t gpugrid-compiler compiler`).
- `backend/.env` with `DATABASE_URL`, `AGENT_TOKEN` and `JWT_SECRET`, and the migrations applied.

The backend and the frontend are started automatically if they are not running.

## Commands

    npm ci
    npx playwright install chromium     # only the first time
    npm test                            # every test
    npm test -- --grep-invert @simulated  # with a real GPU agent (cd agent && npm start)
    npm test -- --grep-invert @gpu        # with a simulated agent (AGENT_SIMULATE=1 npm start), as the CI
    npm run test:ui                     # interactive mode: see each step
    npm run report                      # HTML report of the last run
    npm run codegen                     # record a new test by using the web

## Tags

- `@gpu`: needs an agent with a real GPU connected (`cd agent && npm start`).
- `@simulated`: needs an agent in simulation mode (`cd agent && AGENT_SIMULATE=1 npm start`).
  GitHub Actions runs every test except the `@gpu` one, with a simulated agent.

## What is tested

- `tests/auth.spec.ts`: sign-up, log in and log out, and the pages each role can open.
- `tests/jobs.spec.ts`: a CUDA job of one file, from compilation errors to its result, the history and its filters.
- `tests/projects-docker.spec.ts`: a project of several files uploaded as a .zip
  (`fixtures/vector-add-project.zip`), and Docker jobs with a published image or an uploaded .tar.
