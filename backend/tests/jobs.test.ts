import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { createJob, loggedIn, resetDatabase } from './helpers.js';

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

describe('POST /api/jobs with a project of several files', () => {
  const project = {
    name: 'Vector addition project',
    files: [
      { path: 'main.cu', content: '#include "include/kernels.cuh"\nint main() { launch(); }' },
      { path: 'src/kernels.cu', content: '__global__ void k() {}\nvoid launch() {}' },
      { path: 'include/kernels.cuh', content: 'void launch();' },
    ],
  };

  it('stores every file with its path, and main.cu as the code of the job', async () => {
    const response = await client.post('/api/jobs').send(project);

    expect(response.status).toBe(201);
    const stored = await prisma.job.findUniqueOrThrow({ where: { id: response.body.id } });
    expect(stored.files).toEqual(project.files);
    expect(stored.sourceCode).toBe(project.files[0].content);
  });

  it('returns the files of the job, also for jobs of a single file', async () => {
    const multi = await client.post('/api/jobs').send(project);
    const single = await client.post('/api/jobs').send(validJob);

    const multiJob = await client.get(`/api/jobs/${multi.body.id}`);
    const singleJob = await client.get(`/api/jobs/${single.body.id}`);

    expect(multiJob.body.files).toEqual(project.files);
    expect(singleJob.body.files).toEqual([{ path: 'main.cu', content: validJob.sourceCode }]);
    expect(multiJob.body).not.toHaveProperty('sourceCode');
  });

  it('cleans Windows paths', async () => {
    const response = await client.post('/api/jobs').send({
      name: 'Windows',
      files: [{ path: 'src\\main.cu', content: 'int main() {}' }],
    });

    const stored = await prisma.job.findUniqueOrThrow({ where: { id: response.body.id } });
    expect(stored.files).toEqual([{ path: 'src/main.cu', content: 'int main() {}' }]);
  });

  it.each([
    ['a path that leaves the project', '../outside.cu'],
    ['an absolute path', '/etc/passwd.cu'],
    ['a hidden file', '.secret.cu'],
    ['a file that is not source code', 'run.sh'],
    ['a path inside "program", the compiled binary', 'program/x.cu'],
  ])('rejects %s', async (_case, path) => {
    const response = await client.post('/api/jobs').send({
      name: 'Bad',
      files: [
        { path: 'main.cu', content: 'int main() {}' },
        { path, content: 'x' },
      ],
    });

    expect(response.status).toBe(400);
    expect(response.body.details[0].field).toBe('files.1.path');
    expect(await prisma.job.count()).toBe(0);
  });

  it('rejects projects without .cu files and repeated paths', async () => {
    const noCu = await client.post('/api/jobs').send({
      name: 'No CUDA',
      files: [{ path: 'notes.txt', content: 'hi' }],
    });
    const repeated = await client.post('/api/jobs').send({
      name: 'Twice',
      files: [
        { path: 'main.cu', content: 'a' },
        { path: 'main.cu', content: 'b' },
      ],
    });

    expect(noCu.body.details[0].message).toBe('The project needs at least one .cu file');
    expect(repeated.body.details[0].message).toBe('main.cu appears twice');
  });

  it('needs either sourceCode or files, not both', async () => {
    const both = await client.post('/api/jobs').send({ ...project, sourceCode: 'int main() {}' });
    const none = await client.post('/api/jobs').send({ name: 'Nothing' });

    expect(both.status).toBe(400);
    expect(none.status).toBe(400);
    expect(none.body.details[0].message).toBe(
      'Send either sourceCode (one file) or files (a project)',
    );
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
  /** Three jobs created a few milliseconds apart; the second one is COMPLETED. */
  async function createJobs() {
    for (const name of ['first', 'second', 'third']) {
      await createJob({ name, sourceCode: 'int main() {}', clientId: client.user.id });
      // Distinct timestamps, so the order is deterministic
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    await prisma.job.updateMany({ where: { name: 'second' }, data: { status: 'COMPLETED' } });
  }

  it('lists jobs newest first, without their code or outputs', async () => {
    await createJobs();

    const response = await client.get('/api/jobs');

    expect(response.status).toBe(200);
    expect(response.body.jobs.map((job: { name: string }) => job.name)).toEqual([
      'third',
      'second',
      'first',
    ]);
    expect(response.body.jobs[0]).not.toHaveProperty('stdout');
    expect(response.body.jobs[0]).not.toHaveProperty('sourceCode');
  });

  it('counts jobs in every status', async () => {
    await createJobs();

    const response = await client.get('/api/jobs');

    expect(response.body.counts).toMatchObject({ PENDING: 2, COMPLETED: 1, FAILED: 0 });
  });

  it('filters by status and limits the number of results', async () => {
    await createJobs();

    const filtered = await client.get('/api/jobs?status=COMPLETED');
    const limited = await client.get('/api/jobs?limit=2');

    expect(filtered.body.jobs.map((job: { name: string }) => job.name)).toEqual(['second']);
    expect(limited.body.jobs).toHaveLength(2);
  });

  it('rejects an unknown status', async () => {
    const response = await client.get('/api/jobs?status=EXPLODED');

    expect(response.status).toBe(400);
    expect(response.body.details[0].field).toBe('status');
  });
});

describe('jobs belong to their client', () => {
  it('stores who submitted each job', async () => {
    const response = await client.post('/api/jobs').send(validJob);

    const stored = await prisma.job.findUnique({ where: { id: response.body.id } });
    expect(stored?.clientId).toBe(client.user.id);
  });

  it('lists and counts only the jobs of the client', async () => {
    await createJob({ name: 'mine', sourceCode: 'x', clientId: client.user.id });
    await createJob({ name: 'theirs', sourceCode: 'x', status: 'COMPLETED' });

    const response = await client.get('/api/jobs');

    expect(response.body.jobs.map((job: { name: string }) => job.name)).toEqual(['mine']);
    expect(response.body.counts).toMatchObject({ PENDING: 1, COMPLETED: 0 });
  });

  it("answers 404 for someone else's job, without revealing that it exists", async () => {
    const theirs = await createJob({ name: 'theirs', sourceCode: 'x' });

    const response = await client.get(`/api/jobs/${theirs.id}`);

    expect(response.status).toBe(404);
  });

  it('lets administrators see every job', async () => {
    const admin = await loggedIn(app, 'ADMIN');
    const theirs = await createJob({ name: 'theirs', sourceCode: 'x' });
    await createJob({ name: 'mine', sourceCode: 'x', clientId: client.user.id });

    const list = await admin.get('/api/jobs');
    const one = await admin.get(`/api/jobs/${theirs.id}`);

    expect(list.body.jobs).toHaveLength(2);
    expect(one.status).toBe(200);
  });

  it('shows no client jobs to providers', async () => {
    const provider = await loggedIn(app, 'PROVIDER');
    await createJob({ name: 'theirs', sourceCode: 'x' });

    const response = await provider.get('/api/jobs');

    expect(response.body.jobs).toEqual([]);
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
