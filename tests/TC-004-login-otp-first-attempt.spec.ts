import { test, expect } from '@playwright/test';
import { login, env } from '../helpers/login';

// QA Platform: TC-004 - Successful Login With Valid OTP On First Attempt
// STATUS: BLOCKED - 2FA not implemented in QA Platform.
// Settings has no 2FA toggle. After valid login, app goes straight to dashboard,
// never to an OTP verification screen. TC-001 proves this.
// This test is skipped in nightly-smoke until 2FA is built.
// DO NOT force it green by faking an OTP input - that would hide a missing feature.

test.skip('TC-004 - Successful Login With Valid OTP On First Attempt [BLOCKED: 2FA not implemented]', async ({ page }) => {
  await login(page, env('TEST_USER_EMAIL'), env('TEST_USER_PASSWORD'));
  const otpInput = page.getByLabel(/otp|verification code|one-time/i).or(page.getByPlaceholder(/otp|code/i)).or(page.locator('input[inputmode="numeric"]')).first();
  await otpInput.fill(env('TEST_OTP', '123456'));
  await page.getByRole('button', { name: /verify|confirm|submit/i }).click();
  await expect(page).toHaveURL(/dashboard|home|products|account/i);
});
