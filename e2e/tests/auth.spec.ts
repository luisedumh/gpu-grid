import { expect, test } from '@playwright/test';
import { PASSWORD, logIn, register } from './helpers.ts';

test.describe('Session', () => {
  test('sends visitors without a session to the login page', async ({ page }) => {
    await page.goto('/jobs');

    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
  });

  test('checks the sign-up form before sending it', async ({ page }) => {
    await page.goto('/register');
    await page.getByLabel('Email').fill('not-an-email');
    await page.getByLabel('Password').fill('short');
    await page.getByRole('button', { name: 'Create account' }).click();

    await expect(page.getByText('Enter your name')).toBeVisible();
    await expect(page.getByText('Enter a valid email address')).toBeVisible();
    await expect(page.getByText('Use at least 8 characters')).toBeVisible();
    await expect(page).toHaveURL(/\/register$/);
  });

  test('a new client signs up, keeps the session after reloading and logs out', async ({
    page,
  }) => {
    const user = await register(page, 'Client');

    // A client starts on New job, and the menu shows their name and role
    await expect(page).toHaveURL(/\/jobs\/new$/);
    await expect(page.getByText('Client', { exact: true })).toBeVisible();

    // The session cookie survives a reload
    await page.reload();
    await expect(page.getByText(user.name)).toBeVisible();

    await page.getByRole('button', { name: 'Log out' }).click();
    await expect(page).toHaveURL(/\/login$/);
  });

  test('rejects a wrong password and accepts the right one', async ({ page }) => {
    const user = await register(page, 'Client');
    await page.getByRole('button', { name: 'Log out' }).click();

    await logIn(page, user.email, 'wrong-password');
    await expect(page.getByText('Wrong email or password')).toBeVisible();

    await logIn(page, user.email, PASSWORD);
    await expect(page).toHaveURL(/\/jobs\/new$/);
  });

  test('a provider only sees the pages of providers', async ({ page }) => {
    await register(page, 'Provider');

    await expect(page).toHaveURL(/\/providers$/);
    await expect(page.getByRole('link', { name: 'New job' })).toHaveCount(0);

    // Typing the address of a client page sends them back to their own home page
    await page.goto('/jobs/new');
    await expect(page).toHaveURL(/\/providers$/);
  });
});
