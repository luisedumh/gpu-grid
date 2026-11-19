import { expect, test } from '@playwright/test';
import { BROKEN_PROGRAM, VECTOR_ADD, register, submitJob } from './helpers.ts';

test.describe('Jobs', () => {
  test('shows the nvcc errors of a program that does not compile', async ({ page }) => {
    await register(page, 'Client');
    await submitJob(page, BROKEN_PROGRAM);

    // The console under the editor shows the compiler message in red
    await expect(page.getByText('Compilation error')).toBeVisible({ timeout: 90_000 });
    await expect(page.getByText(/identifier "x" is undefined/)).toBeVisible();
  });

  test('a compiled job appears in My jobs with its details', async ({ page }) => {
    await register(page, 'Client');
    const name = await submitJob(page, VECTOR_ADD);

    // Compiled: it waits for a GPU, or is already running or finished if an agent is connected
    await expect(
      page.getByText(/Waiting for a free GPU|Running on a GPU|Completed/).first(),
    ).toBeVisible({ timeout: 90_000 });

    // The "Details" link of the console opens the job in My jobs
    await page.getByRole('link', { name: 'Details' }).click();
    await expect(page).toHaveURL(/\/jobs\/[0-9a-f-]{36}$/);
    await expect(page.getByRole('heading', { name })).toBeVisible();
    await expect(page.getByRole('cell', { name })).toBeVisible();
    await expect(page.getByRole('link', { name: 'My jobs' })).toHaveClass(/(^|\s)bg-white\/10/);
  });

  test('filters the history by status', async ({ page }) => {
    await register(page, 'Client');
    const name = await submitJob(page, BROKEN_PROGRAM, 'Broken');
    await expect(page.getByText('Compilation error')).toBeVisible({ timeout: 90_000 });

    await page.getByRole('link', { name: 'My jobs' }).click();
    const filter = page.getByLabel('Filter by status');

    await filter.selectOption('COMPILE_FAILED');
    await expect(page.getByRole('cell', { name })).toBeVisible();

    await filter.selectOption('COMPLETED');
    await expect(page.getByRole('cell', { name })).toHaveCount(0);

    // Opening the job shows the compiler output in the detail panel
    await filter.selectOption('');
    await page.getByRole('cell', { name }).click();
    await expect(page.getByText('Compiler output')).toBeVisible();
    await expect(page.locator('aside').getByText(/identifier "x" is undefined/)).toBeVisible();
  });

  test('runs a program on a provider GPU', { tag: '@gpu' }, async ({ page }) => {
    // Needs an agent connected to the backend (cd agent && npm start)
    await register(page, 'Client');
    await submitJob(page, VECTOR_ADD, 'GPU');

    await expect(page.getByText('Completed', { exact: true })).toBeVisible({ timeout: 90_000 });
    await expect(page.getByText(/Result OK/)).toBeVisible();
    await expect(page.getByText('exit code 0')).toBeVisible();
  });

  test('a client cannot see the jobs of other clients', async ({ page }) => {
    // Ana sends a job and keeps its address
    await register(page, 'Client', 'Ana');
    const name = await submitJob(page, BROKEN_PROGRAM, 'Private');
    await expect(page.getByText('Compilation error')).toBeVisible({ timeout: 90_000 });
    await page.getByRole('link', { name: 'Details' }).click();
    const jobUrl = page.url();
    await page.getByRole('button', { name: 'Log out' }).click();

    // Bruno does not see it in his history, nor by typing its address
    await register(page, 'Client', 'Bruno');
    await page.getByRole('link', { name: 'My jobs' }).click();
    await expect(page.getByText('No jobs yet')).toBeVisible();
    await expect(page.getByRole('cell', { name })).toHaveCount(0);

    await page.goto(jobUrl);
    await expect(page.getByText(/not found/)).toBeVisible();
  });
});
