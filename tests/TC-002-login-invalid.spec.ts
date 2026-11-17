import { test, expect } from '@playwright/test';
import { login, env } from '../helpers/login';

// QA Platform: TC-002 - User login with invalid credentials
// Covers all 3 combinations in one Test Case:
//  a) valid username + invalid password
//  b) invalid username + valid password
//  c) both invalid

test('TC-002a - valid username + invalid password', async ({ page }) => {
  await login(page, env('TEST_USER_EMAIL'), env('TEST_USER_INVALID_PASSWORD', 'WrongPassword123!'));
  await expect(page).toHaveURL(/login|sign-in|auth/i);
  await expect(page.getByText(/invalid|incorrect|wrong|failed|try again/i).first()).toBeVisible();
});

test('TC-002b - invalid username + valid password', async ({ page }) => {
  await login(page, env('TEST_USER_INVALID_EMAIL', 'invalid@example.com'), env('TEST_USER_PASSWORD'));
  await expect(page).toHaveURL(/login|sign-in|auth/i);
  await expect(page.getByText(/invalid|incorrect|wrong|failed|try again/i).first()).toBeVisible();
});

test('TC-002c - both invalid', async ({ page }) => {
  await login(page, env('TEST_USER_INVALID_EMAIL', 'invalid@example.com'), env('TEST_USER_INVALID_PASSWORD', 'WrongPassword123!'));
  await expect(page).toHaveURL(/login|sign-in|auth/i);
  await expect(page.getByText(/invalid|incorrect|wrong|failed|try again/i).first()).toBeVisible();
});
