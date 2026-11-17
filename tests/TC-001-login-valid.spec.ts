import { test, expect } from '@playwright/test';
import { login, env } from '../helpers/login';
// QA Platform: REQ-101 / TC-001 - User login with valid credentials
// Suite: Automation - Smoke / Plan: Automation - Regression
test('TC-001 - User login with valid credentials', async ({ page }) => {
  await login(page, env('TEST_USER_EMAIL'), env('TEST_USER_PASSWORD'));
  await expect(page).toHaveURL(/dashboard|home|products|account/i);
  await expect(page.getByText(/welcome|dashboard|my account/i).first()).toBeVisible();
});
