import { test, expect } from '@playwright/test';
import { attemptLogin, env } from '../helpers/login';

// TC-002 - invalid login must stay on /auth/login with error, NOT redirect
// Uses attemptLogin, NOT login(), because login() waits to leave /auth/login (valid only)

test('TC-002a - valid username + invalid password', async ({ page }) => {
  const email = env('TEST_USER_EMAIL');
  await attemptLogin(page, email, 'WrongPassword123!');
  await expect(page).toHaveURL(/\/auth\/login/);
  await expect(page.getByText(/invalid login credentials/i)).toBeVisible();
});

test('TC-002b - invalid username + valid password', async ({ page }) => {
  const password = env('TEST_USER_PASSWORD');
  await attemptLogin(page, 'wrong.user@example.com', password);
  await expect(page).toHaveURL(/\/auth\/login/);
  await expect(page.getByText(/invalid login credentials/i)).toBeVisible();
});

test('TC-002c - both invalid', async ({ page }) => {
  await attemptLogin(page, 'wrong.user@example.com', 'WrongPassword123!');
  await expect(page).toHaveURL(/\/auth\/login/);
  await expect(page.getByText(/invalid login credentials/i)).toBeVisible();
});
