import { test, expect } from '@playwright/test';
import { login, env } from '../helpers/login';
// QA Platform: TC-003 - Add a product to the cart
test('TC-003 - Add a product to the cart', async ({ page }) => {
  await login(page, env('TEST_USER_EMAIL'), env('TEST_USER_PASSWORD'));
  await page.goto('/products');
  await page.getByRole('button', { name: /add to cart/i }).first().click();
  const cartBadge = page.getByTestId('cart-count').or(page.getByText(/cart.*1/i).first());
  await expect(cartBadge).toBeVisible();
});
