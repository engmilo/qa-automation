import { Page } from '@playwright/test';
export async function login(page: Page, email: string, password: string) {
  await page.goto('/auth/login');
  const emailInput = page.getByLabel(/email/i).or(page.getByPlaceholder(/email/i)).or(page.locator('input[type="email"]')).first();
  await emailInput.fill(email);
  const passwordInput = page.getByLabel(/password/i).or(page.getByPlaceholder(/password/i)).or(page.locator('input[type="password"]')).first();
  await passwordInput.fill(password);
  await page.getByRole('button', { name: /log in|sign in|login/i }).click();
  // Valid login only: wait to leave /auth/login
  try {
    await page.waitForURL((url) => !url.pathname.startsWith('/auth/login'), { timeout: 15000 });
  } catch {
    const body = await page.locator('body').innerText().catch(() => '');
    throw new Error('Login did not leave /auth/login after 15s. Still on login page. Body: ' + body.slice(0, 500));
  }
}
// Invalid login: fill + click, do NOT wait to leave - staying + 'Invalid login credentials' is the PASS
export async function attemptLogin(page: Page, email: string, password: string) {
  await page.goto('/auth/login');
  const emailInput = page.getByLabel(/email/i).or(page.getByPlaceholder(/email/i)).or(page.locator('input[type="email"]')).first();
  await emailInput.fill(email);
  const passwordInput = page.getByLabel(/password/i).or(page.getByPlaceholder(/password/i)).or(page.locator('input[type="password"]')).first();
  await passwordInput.fill(password);
  await page.getByRole('button', { name: /log in|sign in|login/i }).click();
  // Wait for error to appear, not for redirect
  await page.getByText(/invalid login credentials/i).waitFor({ timeout: 15000 });
}
export function env(name: string, fallback = '') {
  const v = process.env[name] ?? fallback;
  if (!v) throw new Error('Missing env ' + name + ' - copy Automation/.env.example to Automation/.env');
  return v;
}
