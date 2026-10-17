import express from 'express';

/**
 * Builds and configures the Express application.
 * Kept separate from server startup so tests can use the app
 * without opening a real network port.
 */
export function createApp() {
  const app = express();

  // Parse JSON request bodies into req.body
  app.use(express.json());

  // Health check: lets Docker, Nginx or a monitor know the backend is alive
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  return app;
}
