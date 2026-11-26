import { readFileSync } from 'node:fs';
import { expect, type Page } from '@playwright/test';

export const PASSWORD = 'e2e-password-123';

/** A name and email that no other test run has used. */
export function newUser(prefix: string) {
  const id = `${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  return { name: `${prefix} ${id}`, email: `${prefix.toLowerCase()}-${id}@e2e.test` };
}

/** Creates an account from the sign-up page; the app logs it in straight away. */
export async function register(page: Page, role: 'Client' | 'Provider', prefix = role) {
  const user = newUser(prefix);
  await page.goto('/register');
  await page.getByRole('button', { name: role }).click();
  await page.getByLabel('Name').fill(user.name);
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByText(user.name)).toBeVisible();
  return user;
}

export async function logIn(page: Page, email: string, password = PASSWORD) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Log in' }).click();
}

/** The example program of the repository (adds two vectors on the GPU). */
export const VECTOR_ADD = readFileSync(
  new URL('../../compiler/examples/vector_add.cu', import.meta.url),
  'utf8',
);

/** The same program with a mistake: "x" is not declared anywhere. */
export const BROKEN_PROGRAM = VECTOR_ADD.replace('a[i] + b[i]', 'a[i] + x');

/** A unique job name, so each test finds its own job in the history. */
export const jobName = (prefix: string) => `${prefix} ${Date.now()}`;

/**
 * Sends a job of a single file from the New job page and returns its unique name.
 * The code is uploaded with "Upload files" as vector_add.cu: the page starts with
 * the example of that name, so it is replaced and the project keeps one file
 * (two files with a main() would not link).
 */
export async function submitJob(page: Page, code: string, prefix = 'E2E job') {
  const name = jobName(prefix);
  await page.goto('/jobs/new');
  await page.getByTestId('upload-files').setInputFiles({
    name: 'vector_add.cu',
    mimeType: 'text/plain',
    buffer: Buffer.from(code),
  });
  await page.getByLabel('Job name').fill(name);
  await page.getByRole('button', { name: 'Run' }).click();
  return name;
}

/** Fills the job name and presses Run. */
export async function run(page: Page, name: string) {
  await page.getByLabel('Job name').fill(name);
  await page.getByRole('button', { name: 'Run' }).click();
}
