import { test, expect } from '@playwright/test';

// TC-003 v5 - 11 steps
// Fix Step 10 false failure: goToCart waited for #tbodyid visible, but empty cart = hidden tbody
// - goToCart now waits for URL cart.html + #tbodyid attached (not visible) + #totalp attached
// - Everything else same as v4 (300s timeout, Step 6 via #itemc + goto Home)

const DEMOBLAZE = 'https://www.demoblaze.com/';

async function addProductByName(page: any, productName: string, getLastDialog: () => string): Promise<number> {
  console.log(`[TC-003] add ${productName}`);
  await page.goto(DEMOBLAZE);
  const link = page.getByRole('link', { name: productName, exact: true }).first();
  await link.waitFor({ state: 'visible', timeout: 15000 });
  await link.click();
  await page.locator('h3.price-container').waitFor({ timeout: 15000 });
  const priceText = await page.locator('h3.price-container').innerText();
  const price = parseInt(priceText.replace(/[^0-9]/g, ''), 10);
  await page.getByRole('link', { name: 'Add to cart' }).click();
  for (let i = 0; i < 10; i++) {
    if (getLastDialog().toLowerCase().includes('product added')) break;
    await page.waitForTimeout(500);
  }
  await page.waitForTimeout(500);
  return price;
}
async function goToCart(page: any) {
  console.log('[TC-003] go to Cart');
  await page.getByRole('link', { name: 'Cart', exact: true }).click();
  await page.waitForURL(/cart\.html/, { timeout: 15000 });
  // Empty cart => #tbodyid is hidden (0 rows), so wait for attached not visible
  await page.locator('#tbodyid').waitFor({ state: 'attached', timeout: 15000 });
  await page.waitForTimeout(800);
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
async function clearCart(page: any) {
  console.log('[TC-003] clear cart');
  await goToCart(page);
  for (let i = 0; i < 10; i++) {
    const deletes = page.getByRole('link', { name: 'Delete' });
    if ((await deletes.count()) === 0) break;
    await deletes.first().click();
    await page.waitForTimeout(800);
  }
}

test('TC-003 - Add a product to the cart', async ({ page }) => {
  test.setTimeout(300000);
  let lastDialog = '';
  page.on('dialog', async (dialog) => {
    lastDialog = dialog.message();
    await dialog.accept();
  });
  const getLastDialog = () => lastDialog;

  console.log('[TC-003] Step 1: add Samsung');
  lastDialog = '';
  const price1 = await addProductByName(page, 'Samsung galaxy s6', getLastDialog);
  expect(lastDialog).toMatch(/Product added/i);
  expect(price1).toBeGreaterThan(0);

  console.log('[TC-003] Step 2: cart has Samsung');
  await goToCart(page);
  let cart = await getCartRows(page);
  expect(cart.map((c) => c.title)).toContain('Samsung galaxy s6');

  console.log('[TC-003] Step 3: add Nokia, both with correct prices');
  lastDialog = '';
  const price2 = await addProductByName(page, 'Nokia lumia 1520', getLastDialog);
  await goToCart(page);
  cart = await getCartRows(page);
  expect(cart.length).toBe(2);
  expect(cart.map((c) => c.title).sort()).toEqual(['Nokia lumia 1520', 'Samsung galaxy s6'].sort());

  console.log('[TC-003] Step 4: delete one');
  const beforeDelete = (await getCartRows(page)).length;
  await page.getByRole('link', { name: 'Delete' }).first().click();
  await page.waitForTimeout(1000);
  expect((await getCartRows(page)).length).toBe(beforeDelete - 1);

  console.log('[TC-003] Step 5: total = sum');
  await clearCart(page);
  lastDialog = '';
  const pA = await addProductByName(page, 'Samsung galaxy s6', getLastDialog);
  lastDialog = '';
  const pB = await addProductByName(page, 'Nokia lumia 1520', getLastDialog);
  await goToCart(page);
  cart = await getCartRows(page);
  expect(cart.length).toBe(2);
  const totalText = (await page.locator('#totalp').innerText()).trim();
  expect(parseInt(totalText.replace(/[^0-9]/g, ''), 10)).toBe(pA + pB);

  console.log('[TC-003] Step 6: browse, product remains');
  await clearCart(page);
  lastDialog = '';
  await addProductByName(page, 'Samsung galaxy s6', getLastDialog);
  console.log('[TC-003] Step 6: click Laptops category');
  await page.goto(DEMOBLAZE);
  await page.locator('a#itemc:has-text("Laptops")').click();
  await page.waitForTimeout(1500);
  console.log('[TC-003] Step 6: click Phones category');
  await page.locator('a#itemc:has-text("Phones")').click();
  await page.waitForTimeout(1500);
  console.log('[TC-003] Step 6: back to Home via goto');
  await page.goto(DEMOBLAZE);
  await page.waitForTimeout(1000);
  await goToCart(page);
  cart = await getCartRows(page);
  expect(cart.map((c) => c.title)).toContain('Samsung galaxy s6');

  console.log('[TC-003] Step 7: Place Order modal');
  await page.locator('button[data-target="#orderModal"]').click();
  const modal = page.locator('#orderModal');
  await expect(modal).toBeVisible({ timeout: 15000 });
  await expect(modal.locator('#name')).toBeVisible({ timeout: 10000 });

  console.log('[TC-003] Step 8: fill form');
  await modal.locator('#name').fill('Milo Test');
  await modal.locator('#country').fill('Finland');
  await modal.locator('#city').fill('Espoo');
  await modal.locator('#card').fill('1234 5678 9012 3456');
  await modal.locator('#month').fill('11');
  await modal.locator('#year').fill('2026');

  console.log('[TC-003] Step 9: Purchase -> Thank you');
  await modal.locator('button:has-text("Purchase")').click();
  await expect(page.getByText(/Thank you for your purchase/i)).toBeVisible({ timeout: 20000 });

  console.log('[TC-003] Step 10: OK -> cart empty');
  const okBtn = page.locator('.sweet-alert button.confirm, .sweet-alert button:has-text("OK"), button.swal-button--confirm');
  await okBtn.first().click({ timeout: 10000 });
  await page.waitForTimeout(1000);
  await goToCart(page);
  await expect(page.locator('#tbodyid tr')).toHaveCount(0);

  console.log('[TC-003] Step 11: done');
});
