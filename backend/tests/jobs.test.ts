import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { loggedIn, resetDatabase } from './helpers.js';

const app = createApp();

const validJob = {
  name: 'Vector addition',
  sourceCode: '__global__ void k() {}\nint main() { return 0; }',
};

/** A logged-in client, created again before each test. */
let client: Awaited<ReturnType<typeof loggedIn>>;

beforeEach(async () => {
  await resetDatabase();
  client = await loggedIn(app, 'CLIENT');
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('POST /api/jobs', () => {
  it('creates a pending job and stores it', async () => {
    const response = await client.post('/api/jobs').send(validJob);

    expect(response.status).toBe(201);
    expect(response.body.status).toBe('PENDING');
    expect(response.headers.location).toBe(`/api/jobs/${response.body.id}`);

    const stored = await prisma.job.findUnique({ where: { id: response.body.id } });
    expect(stored?.name).toBe(validJob.name);
    expect(stored?.sourceCode).toBe(validJob.sourceCode);
    expect(stored?.timeoutSeconds).toBe(60);
  });

  it('notifies that a new job was created, so it can be compiled', async () => {
    const onJobCreated = vi.fn();
    const appWithHook = createApp({ onJobCreated });

    const response = await (await loggedIn(appWithHook)).post('/api/jobs').send(validJob);

    expect(onJobCreated).toHaveBeenCalledWith(response.body.id);
  });

  it('accepts a custom timeout', async () => {
    const response = await client.post('/api/jobs').send({ ...validJob, timeoutSeconds: 10 });

    expect(response.status).toBe(201);
    const stored = await prisma.job.findUnique({ where: { id: response.body.id } });
    expect(stored?.timeoutSeconds).toBe(10);
  });

  it('rejects an empty source code', async () => {
    const response = await client.post('/api/jobs').send({ ...validJob, sourceCode: '' });

    expect(response.status).toBe(400);
    expect(response.body.details[0].field).toBe('sourceCode');
    expect(await prisma.job.count()).toBe(0);
  });

  it('rejects a timeout above the limit', async () => {
    const response = await client.post('/api/jobs').send({ ...validJob, timeoutSeconds: 3600 });

    expect(response.status).toBe(400);
    expect(response.body.details[0].field).toBe('timeoutSeconds');
  });

  it('rejects malformed JSON', async () => {
    const response = await client
      .post('/api/jobs')
      .set('Content-Type', 'application/json')
      .send('{ not json');

    expect(response.status).toBe(400);
  });
});

describe('GET /api/jobs/:id', () => {
  it('returns the job without internal fields', async () => {
    const created = await client.post('/api/jobs').send(validJob);

    const response = await client.get(`/api/jobs/${created.body.id}`);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      id: created.body.id,
      name: validJob.name,
      status: 'PENDING',
      stdout: null,
    });
    expect(response.body).not.toHaveProperty('binaryPath');
    expect(response.body).not.toHaveProperty('sourceCode');
  });

  it('returns 404 for an unknown job', async () => {
    const response = await client.get('/api/jobs/does-not-exist');

    expect(response.status).toBe(404);
    expect(response.body.error).toMatch(/not found/);
  });
});

describe('GET /api/jobs', () => {
  it('lists the jobs, newest first', async () => {
    await client.post('/api/jobs').send({ ...validJob, name: 'First' });
    await client.post('/api/jobs').send({ ...validJob, name: 'Second' });

    const response = await client.get('/api/jobs');

    expect(response.status).toBe(200);
    expect(response.body.map((job: { name: string }) => job.name)).toEqual(['Second', 'First']);
  });
});

describe('permissions', () => {
  it('rejects requests without a session', async () => {
    expect((await request(app).get('/api/jobs')).status).toBe(401);
    expect((await request(app).post('/api/jobs').send(validJob)).status).toBe(401);
  });

  it('does not let providers submit jobs', async () => {
    const provider = await loggedIn(app, 'PROVIDER');

    const response = await provider.post('/api/jobs').send(validJob);

    expect(response.status).toBe(403);
    expect(await prisma.job.count()).toBe(0);
  });

  it('lets administrators submit jobs', async () => {
    const admin = await loggedIn(app, 'ADMIN');

    expect((await admin.post('/api/jobs').send(validJob)).status).toBe(201);
  });
});

describe('unknown routes', () => {
  it('answer with a JSON 404', async () => {
    const response = await request(app).get('/api/nothing-here');

    expect(response.status).toBe(404);
    expect(response.body.error).toBeDefined();
  });
});
