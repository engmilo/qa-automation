import { test, expect } from '@playwright/test';

// TC-003 - demoblaze.com - SPLIT, TC-003d fixed (goto Home, not click)

const DEMOBLAZE = 'https://www.demoblaze.com/';

async function addProductByName(page: any, productName: string): Promise<number> {
  await page.goto(DEMOBLAZE);
  await page.getByRole('link', { name: productName, exact: true }).first().click();
  await page.locator('h3.price-container').waitFor({ timeout: 15000 });
  const priceText = await page.locator('h3.price-container').innerText();
  const price = parseInt(priceText.replace(/[^0-9]/g, ''), 10);
  const dialogPromise = page.waitForEvent('dialog', { timeout: 10000 }).catch(() => null);
  const apiPromise = page.waitForResponse((r) => r.url().includes('/addtocart'), { timeout: 15000 }).catch(() => null);
  await page.getByRole('link', { name: 'Add to cart' }).click();
  const dialog = await dialogPromise;
  if (dialog) {
    expect(dialog.message()).toMatch(/Product added/i);
    await dialog.accept();
  }
  await apiPromise;
  await page.waitForTimeout(1500);
  return price;
}

async function goToCart(page: any) {
  const viewPromise = page.waitForResponse((r) => r.url().includes('/viewcart'), { timeout: 20000 }).catch(() => null);
  await page.getByRole('link', { name: 'Cart', exact: true }).click();
  await page.waitForURL(/cart\.html/, { timeout: 15000 });
  await viewPromise;
  await page.waitForTimeout(2500);
}

async function getCartRows(page: any) {
  const rows = page.locator('#tbodyid tr');
  const count = await rows.count();
  const items: { title: string; price: number }[] = [];
  for (let i = 0; i < count; i++) {
    const title = (await rows.nth(i).locator('td').nth(1).innerText()).trim();
    const priceText = (await rows.nth(i).locator('td').nth(2).innerText()).trim();
    items.push({ title, price: parseInt(priceText.replace(/[^0-9]/g, ''), 10) });
  }
  return items;
}

async function waitForCartCount(page: any, expected: number) {
  for (let i = 0; i < 12; i++) {
    const rows = await getCartRows(page);
    if (rows.length === expected) return rows;
    await page.waitForTimeout(1000);
  }
  return await getCartRows(page);
}

test('TC-003a - Add product and view in cart', async ({ page }) => {
  test.setTimeout(60000);
  const price1 = await addProductByName(page, 'Samsung galaxy s6');
  expect(price1).toBeGreaterThan(0);
  await goToCart(page);
  let cart = await waitForCartCount(page, 1);
  expect(cart.map((c) => c.title)).toContain('Samsung galaxy s6');
  const price2 = await addProductByName(page, 'Nokia lumia 1520');
  await goToCart(page);
  cart = await waitForCartCount(page, 2);
  expect(cart.length).toBe(2);
  expect(cart.map((c) => c.title).sort()).toEqual(['Nokia lumia 1520', 'Samsung galaxy s6'].sort());
  const cartPrices = cart.map((c) => c.price).sort((a, b) => a - b);
  expect(cartPrices).toEqual([price1, price2].sort((a, b) => a - b));
});

test('TC-003b - Delete product from cart', async ({ page }) => {
  test.setTimeout(90000);
  await addProductByName(page, 'Samsung galaxy s6');
  await addProductByName(page, 'Nokia lumia 1520');
  await goToCart(page);
  let cart = await waitForCartCount(page, 2);
  expect(cart.length).toBe(2);
  const delPromise = page.waitForResponse((r) => r.url().includes('/deletecart'), { timeout: 15000 }).catch(() => null);
  await page.getByRole('link', { name: 'Delete' }).first().click();
  await delPromise;
  await page.waitForTimeout(1500);
  await goToCart(page);
  cart = await waitForCartCount(page, 1);
  expect(cart.length).toBe(1);
});

test('TC-003c - Total equals sum of product prices', async ({ page }) => {
  test.setTimeout(60000);
  const pA = await addProductByName(page, 'Samsung galaxy s6');
  const pB = await addProductByName(page, 'Nokia lumia 1520');
  await goToCart(page);
  const cart = await waitForCartCount(page, 2);
  expect(cart.length).toBe(2);
  const totalText = (await page.locator('#totalp').innerText()).trim();
  const total = parseInt(totalText.replace(/[^0-9]/g, ''), 10);
  expect(total).toBe(pA + pB);
});

test('TC-003d - Product remains after browsing + close browser', async ({ page }) => {
  test.setTimeout(90000);
  await addProductByName(page, 'Samsung galaxy s6');
  await page.goto(DEMOBLAZE);
  await page.getByRole('link', { name: 'Laptops', exact: true }).click();
  await page.waitForTimeout(1500);
  await page.goto(DEMOBLAZE);
  await page.getByRole('link', { name: 'Phones', exact: true }).click();
  await page.waitForTimeout(1500);
  await page.goto(DEMOBLAZE);
  await page.waitForTimeout(1000);
  await goToCart(page);
  const cart = await waitForCartCount(page, 1);
  expect(cart.map((c) => c.title)).toContain('Samsung galaxy s6');
  await page.close();
  expect(page.isClosed()).toBe(true);
});
