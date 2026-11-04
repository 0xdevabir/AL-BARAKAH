import { expect, test } from '@playwright/test';

test.use({ colorScheme: 'dark' });

for (const [name, url] of [['store', 'http://localhost:3000/login'], ['staff', 'http://localhost:3001/']]) {
  test(`${name} stays light with a green button on a dark-mode device`, async ({ page }) => {
    await page.goto(url, { waitUntil: 'networkidle' });
    const css = (selector: string, prop: string) =>
      page.locator(selector).first().evaluate((el, p) => getComputedStyle(el).getPropertyValue(p), prop);
    expect(await css('body', 'background-color')).toBe('rgb(241, 241, 241)');
    expect(await css('.btn.primary', 'background-color')).toBe('rgb(95, 122, 87)');
  });
}
