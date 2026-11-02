import { expect, test } from '@playwright/test';

const STORE = 'http://localhost:5173';
const STAFF = 'http://localhost:5174';

test('store offers only the customer demo button, and it signs in', async ({ page }) => {
  await page.goto(`${STORE}/login?next=/account`);
  const buttons = page.getByRole('region', { name: 'Demo sign-in' }).getByRole('button');
  await expect(buttons).toHaveText(['Continue as Customer']);
  await buttons.first().click();
  await expect(page).toHaveURL(`${STORE}/account`);
  await expect(page.getByText('+8801700000004')).toBeVisible();
});

for (const [role, path] of [['Admin', '/admin'], ['Rider', '/delivery'], ['Doctor', '/doctor']]) {
  test(`staff ${role} demo button opens that portal`, async ({ page }) => {
    await page.goto(`${STAFF}/`);
    await page.getByRole('button', { name: `Continue as ${role}` }).click();
    await expect(page).toHaveURL(new RegExp(`${path}(/|$)`));
  });
}

test('staff page does not offer a customer demo button', async ({ page }) => {
  await page.goto(`${STAFF}/`);
  await expect(page.getByRole('button', { name: 'Continue as Admin' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue as Customer' })).toHaveCount(0);
});
