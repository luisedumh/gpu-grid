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
    npm test -- --grep-invert @gpu      # without the tests that need a GPU agent
    npm run test:ui                     # interactive mode: see each step
    npm run report                      # HTML report of the last run
    npm run codegen                     # record a new test by using the web

## Tags

- `@gpu`: needs an agent with a GPU connected (`cd agent && npm start`).
