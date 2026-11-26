import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { loggedIn, resetDatabase } from './helpers.js';

let uploadsDir: string;
const onJobCreated = vi.fn();
const onJobQueued = vi.fn();
let app: ReturnType<typeof createApp>;
let client: Awaited<ReturnType<typeof loggedIn>>;

const dockerJob = {
  kind: 'DOCKER',
  name: 'CUDA sample',
  image: 'nvidia/cuda:13.0.1-base-ubuntu24.04',
  command: 'nvidia-smi',
  timeoutSeconds: 30,
};

beforeAll(async () => {
  uploadsDir = await mkdtemp(path.join(tmpdir(), 'gpugrid-uploads-'));
});

beforeEach(async () => {
  await resetDatabase();
  await rm(uploadsDir, { recursive: true, force: true });
  onJobCreated.mockClear();
  onJobQueued.mockClear();
  // 1 KB limit, so the "too big" case can be tested without gigabytes
  app = createApp({ onJobCreated, onJobQueued, uploadsDir, maxArchiveBytes: 1024 });
  client = await loggedIn(app, 'CLIENT');
});

afterAll(async () => {
  await rm(uploadsDir, { recursive: true, force: true });
  await prisma.$disconnect();
});

/** Files left in the uploads folder (it may not exist yet). */
const uploadedFiles = () => readdir(uploadsDir).catch(() => [] as string[]);

/** Sends the upload form as the logged-in client. */
function upload(fields: Record<string, string>, file?: { content: string; name: string }) {
  const req = request(app).post('/api/jobs/docker-archive').set('Cookie', client.cookie);
  for (const [key, value] of Object.entries(fields)) void req.field(key, value);
  if (file) void req.attach('archive', Buffer.from(file.content), file.name);
  return req;
}

describe('POST /api/jobs with a Docker image', () => {
  it('stores the job already QUEUED, without compiling it', async () => {
    const response = await client.post('/api/jobs').send(dockerJob);

    expect(response.status).toBe(201);
    expect(response.body.status).toBe('QUEUED');
    const stored = await prisma.job.findUniqueOrThrow({ where: { id: response.body.id } });
    expect(stored).toMatchObject({
      kind: 'DOCKER',
      image: dockerJob.image,
      command: 'nvidia-smi',
      timeoutSeconds: 30,
      sourceCode: '',
    });
    expect(onJobQueued).toHaveBeenCalledWith(response.body.id);
    expect(onJobCreated).not.toHaveBeenCalled();
  });

  it('runs the default command of the image when none is given', async () => {
    const response = await client.post('/api/jobs').send({ ...dockerJob, command: '' });

    const stored = await prisma.job.findUniqueOrThrow({ where: { id: response.body.id } });
    expect(stored.command).toBeNull();
  });

  it('rejects an invalid image name', async () => {
    const response = await client.post('/api/jobs').send({ ...dockerJob, image: '--privileged' });

    expect(response.status).toBe(400);
    expect(response.body.details[0].field).toBe('image');
    expect(await prisma.job.count()).toBe(0);
  });

  it('shows the Docker fields in the detail, but never where files are stored', async () => {
    const created = await client.post('/api/jobs').send(dockerJob);

    const response = await client.get(`/api/jobs/${created.body.id}`);

    expect(response.body).toMatchObject({
      kind: 'DOCKER',
      image: dockerJob.image,
      imageArchiveName: null,
      command: 'nvidia-smi',
      files: [],
    });
    expect(response.body).not.toHaveProperty('archivePath');
  });

  it('keeps CUDA jobs as before: PENDING and sent to compile', async () => {
    const response = await client
      .post('/api/jobs')
      .send({ name: 'CUDA', sourceCode: 'int main() {}' });

    expect(response.body.status).toBe('PENDING');
    expect(onJobCreated).toHaveBeenCalledWith(response.body.id);
    expect(onJobQueued).not.toHaveBeenCalled();
    const listed = await client.get('/api/jobs');
    expect(listed.body.jobs[0].kind).toBe('CUDA');
  });
});

describe('POST /api/jobs/docker-archive', () => {
  it('saves the uploaded .tar and creates a QUEUED Docker job', async () => {
    const response = await upload(
      { name: 'My image', timeoutSeconds: '45', command: 'python3 train.py' },
      { content: 'fake tar', name: 'my-image.tar' },
    );

    expect(response.status).toBe(201);
    expect(response.body.status).toBe('QUEUED');
    const stored = await prisma.job.findUniqueOrThrow({ where: { id: response.body.id } });
    expect(stored).toMatchObject({
      kind: 'DOCKER',
      name: 'My image',
      timeoutSeconds: 45,
      command: 'python3 train.py',
      image: null,
      imageArchiveName: 'my-image.tar',
    });
    // Saved inside the uploads folder with a name chosen by the server
    expect(path.dirname(stored.archivePath!)).toBe(uploadsDir);
    expect(await readFile(stored.archivePath!, 'utf8')).toBe('fake tar');
    expect(onJobQueued).toHaveBeenCalledWith(response.body.id);
  });

  it('needs the file', async () => {
    const response = await upload({ name: 'No file' });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/archive/);
  });

  it('only accepts .tar files', async () => {
    const response = await upload({ name: 'Zip' }, { content: 'x', name: 'image.zip' });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/\.tar/);
    expect(await uploadedFiles()).toEqual([]);
  });

  it('rejects images over the limit and does not keep them', async () => {
    const response = await upload({ name: 'Big' }, { content: 'x'.repeat(2048), name: 'big.tar' });

    expect(response.status).toBe(413);
    expect(await uploadedFiles()).toEqual([]);
    expect(await prisma.job.count()).toBe(0);
  });

  it('deletes the file when the other fields are not valid', async () => {
    const response = await upload(
      { name: '', timeoutSeconds: '9999' },
      { content: 'x', name: 'image.tar' },
    );

    expect(response.status).toBe(400);
    expect(await uploadedFiles()).toEqual([]);
  });

  it('only lets clients upload, and only with a session', async () => {
    const provider = await loggedIn(app, 'PROVIDER');
    const asProvider = await request(app)
      .post('/api/jobs/docker-archive')
      .set('Cookie', provider.cookie)
      .field('name', 'x')
      .attach('archive', Buffer.from('x'), 'image.tar');
    const anonymous = await request(app)
      .post('/api/jobs/docker-archive')
      .field('name', 'x')
      .attach('archive', Buffer.from('x'), 'image.tar');

    expect(asProvider.status).toBe(403);
    expect(anonymous.status).toBe(401);
    expect(await uploadedFiles()).toEqual([]);
  });
});
