import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { jobName, register, run } from './helpers.ts';

/**
 * Sprint 4: projects of several files (file explorer) and Docker images.
 * The jobs run on the simulated agent, as in GitHub Actions (AGENT_SIMULATE=1 npm start).
 */

/** A CUDA project split into main.cu, src/kernels.cu, include/kernels.cuh and README.md */
const PROJECT_ZIP = fileURLToPath(new URL('../fixtures/vector-add-project.zip', import.meta.url));

/** Waits until the job of the console has finished well, and opens its details. */
async function expectCompletedAndOpen(page: Page, output: RegExp) {
  await expect(page.getByText('Completed', { exact: true })).toBeVisible({ timeout: 90_000 });
  await expect(page.getByText(output)).toBeVisible();
  await expect(page.getByText('exit code 0')).toBeVisible();
  await page.getByRole('link', { name: 'Details' }).click();
  await expect(page).toHaveURL(/\/jobs\/[0-9a-f-]{36}$/);
}

async function openDockerTab(page: Page) {
  await page.goto('/jobs/new');
  await page.getByRole('tab', { name: 'Docker image' }).click();
}

test.describe('Projects of several files', () => {
  test(
    'uploads a .zip with folders, compiles every file and runs it',
    { tag: '@simulated' },
    async ({ page }) => {
      await register(page, 'Client');
      await page.goto('/jobs/new');

      // The .zip replaces the example: its folders appear in the explorer
      await page.getByTestId('upload-zip').setInputFiles(PROJECT_ZIP);
      const explorer = page.getByLabel('Project files');
      await expect(explorer.getByText('kernels.cuh')).toBeVisible();
      await expect(explorer.getByText('vector_add.cu')).toHaveCount(0);

      const name = jobName('Project');
      await run(page, name);
      await expectCompletedAndOpen(page, /\[simulated\] Program received \(\d+ bytes\)/);

      // The detail lists the four files of the project, with their folders
      await expect(page.getByText('Files (4)')).toBeVisible();
      await expect(page.getByText('src/kernels.cu')).toBeVisible();
      await expect(page.getByText('include/kernels.cuh')).toBeVisible();
    },
  );
});

test.describe('Docker images', () => {
  test('runs a published image with a command', { tag: '@simulated' }, async ({ page }) => {
    await register(page, 'Client');
    await openDockerTab(page);

    await page.getByLabel('Image', { exact: true }).fill('ubuntu:24.04');
    await page.getByLabel(/Command/).fill('echo hello');
    await run(page, jobName('Docker image'));

    await expectCompletedAndOpen(page, /\[simulated\] Image ubuntu:24\.04 run with echo hello/);
    await expect(page.locator('main').getByText('ubuntu:24.04').first()).toBeVisible();
  });

  test(
    'uploads the .tar of an image and runs its default command',
    { tag: '@simulated' },
    async ({ page }) => {
      await register(page, 'Client');
      await openDockerTab(page);

      await page.getByRole('button', { name: /Upload a \.tar/ }).click();
      // Not a real image: the simulated agent only checks that it can download it
      await page.getByTestId('docker-archive').setInputFiles({
        name: 'my-image.tar',
        mimeType: 'application/x-tar',
        buffer: Buffer.alloc(2048, 1),
      });
      await run(page, jobName('Docker tar'));

      await expectCompletedAndOpen(page, /\[simulated\] Image uploaded image \(2048 bytes\)/);
      await expect(page.getByText('my-image.tar (uploaded)')).toBeVisible();
    },
  );

  test('does not send an invalid image name', async ({ page }) => {
    await register(page, 'Client');
    await openDockerTab(page);

    await page.getByLabel('Image', { exact: true }).fill('not a valid image!');
    await run(page, jobName('Bad image'));

    await expect(page.getByText(/Write a valid image name/)).toBeVisible();
    await page.getByRole('link', { name: 'My jobs' }).click();
    await expect(page.getByText('No jobs yet')).toBeVisible();
  });
});
