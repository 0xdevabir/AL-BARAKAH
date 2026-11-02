import { createHmac } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';

const STORE = 'http://localhost:5173';
const STAFF = 'http://localhost:5174';
const RUN = resolve(import.meta.dirname, '../.run');
const PHONE = { customer: '01711111111', admin: '01700000001', rider: '01700000002', doctor: '01700000003' };
const PHONE_VIEW = { width: 390, height: 844 };

const smsCount = (phone: string) => readFileSync(resolve(RUN, 'api.log'), 'utf8').split('\n').filter((l) => l.includes(`[dev SMS] to +88${phone}`));

async function otp(phone: string, before: number) {
  await expect.poll(() => smsCount(phone).length).toBeGreaterThan(before);
  return /\b(\d{6})\b/.exec(smsCount(phone).at(-1)!)![1];
}

function totp(secret: string) {
  let bits = '';
  for (const c of secret.replace(/=+$/, '')) bits += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'.indexOf(c).toString(2).padStart(5, '0');
  const key = Buffer.from(bits.match(/.{8}/g)!.map((b) => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000)));
  const h = createHmac('sha1', key).update(counter).digest();
  const o = h[19] & 15;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).padStart(6, '0');
}

const open = async (page: Page, url: string) => { await page.goto(url); await page.waitForLoadState("networkidle"); };

const problems: string[] = [];
function watch(page: Page) {
  page.on('pageerror', (e) => problems.push(`${page.url()} ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/status of 4\d\d|hydrat.*warn/i.test(m.text())) problems.push(`${page.url()} ${m.text()}`);
  });
  page.on('dialog', (d) => d.accept('Nobody home'));
}

const contexts: Partial<Record<keyof typeof PHONE, BrowserContext>> = {};
async function session(browser: Browser, who: keyof typeof PHONE) {
  contexts[who] ??= await browser.newContext({ viewport: PHONE_VIEW });
  const page = await contexts[who]!.newPage();
  watch(page);
  return page;
}

async function signIn(page: Page, phone: string) {
  const before = smsCount(phone).length;
  await page.locator('input[name=phone]').fill(phone);
  await page.getByRole('button', { name: 'Send code' }).click();
  await page.locator('input[name=code]').fill(await otp(phone, before));
  await page.getByRole('button', { name: /^Verify/ }).click();
}

async function addAndCheckout(page: Page) {
  await open(page, `${STORE}/`);
  await page.getByRole('button', { name: /^Add / }).first().click();
  await open(page, `${STORE}/cart`);
  await page.getByRole('link', { name: 'Checkout' }).or(page.getByRole('button', { name: 'Checkout' })).click();
  await expect(page.getByRole('heading', { name: 'Address' })).toBeVisible();
}

async function moveOrder(page: Page, filter: string, code: string, action: string) {
  await open(page, `${STAFF}/admin`);
  await page.getByLabel('Status').selectOption({ label: filter });
  await page.getByRole('button', { name: new RegExp(code) }).click();
  if (action === 'Assigned') await page.getByLabel('Delivery person').selectOption({ index: 1 });
  await page.getByRole('button', { name: action, exact: true }).click();
  await expect(page.getByRole('button', { name: new RegExp(code) })).toHaveCount(0);
}

test.describe.serial('all roles', () => {
  let code = '';
  let adminSecret = '';

  test('customer signs in and places a scheduled cash order', async ({ browser }) => {
    const page = await session(browser, 'customer');
    await open(page, `${STORE}/login`);
    await signIn(page, PHONE.customer);
    await expect(page).toHaveURL(`${STORE}/`);
    await addAndCheckout(page);

    await page.getByRole('button', { name: '+ Add a new address' }).click();
    await page.getByLabel('Name for this address').fill('Hall 1');
    await page.getByLabel('Full address').fill('Daffodil International University, Hall 1, Room 204');
    await page.getByLabel('Area').selectOption({ index: 0 });
    await page.getByLabel('Phone for delivery').fill(PHONE.customer);
    await page.getByRole('button', { name: 'Save' }).click();
    await page.getByRole('radio', { name: /Hall 1/ }).click();
    await page.getByRole('button', { name: 'Continue' }).click();

    await page.getByRole('radio').filter({ hasText: /\d/ }).first().click();
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('button', { name: 'Place order' }).click();

    await expect(page).toHaveURL(/\/orders\/[a-z0-9]+/);
    await expect(page.getByText('Order placed').first()).toBeVisible();
    await open(page, `${STORE}/orders`);
    code = (await page.locator('.mono').filter({ hasText: /-|[A-Z]{2}/ }).first().innerText()).trim();
    expect(code).not.toBe('');
    await page.close();
  });

  test('admin turns on two-factor and moves the order to a rider', async ({ browser }) => {
    const page = await session(browser, 'admin');
    await open(page, STAFF);
    await signIn(page, PHONE.admin);
    adminSecret = (await page.locator('code.key').innerText()).trim();
    await page.getByLabel('Authenticator code').fill(totp(adminSecret));
    await page.getByRole('button', { name: 'Verify' }).click();
    await expect(page.getByRole('heading', { name: 'Orders' })).toBeVisible();

    // A reload must keep the admin's two-factor session.
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Orders' })).toBeVisible();

    await moveOrder(page, 'Placed', code, 'Confirmed');
    await moveOrder(page, 'Confirmed', code, 'Packed');
    await moveOrder(page, 'Packed', code, 'Assigned');
    await page.close();
  });

  test('rider sees only the job, delivers it, and cash is tracked', async ({ browser }) => {
    const page = await session(browser, 'rider');
    await open(page, STAFF);
    await signIn(page, PHONE.rider);
    await expect(page.getByRole('heading', { name: 'Jobs' })).toBeVisible();
    await expect(page.getByText(code)).toBeVisible();
    await expect(page.getByRole('link', { name: 'Call customer' })).toHaveAttribute('href', /^tel:/);
    await expect(page.getByText(/Collect .* cash/)).toBeVisible();
    await page.getByRole('button', { name: 'Start delivery' }).click();
    await page.getByRole('button', { name: 'Delivered' }).click();
    await expect(page.getByText('No deliveries assigned')).toBeVisible();
    await open(page, `${STAFF}/delivery/earnings`);
    await expect(page.getByText('Cash to hand over')).toBeVisible();
    await expect(page.locator('.mono').first()).not.toHaveText(/NaN/);
    // A rider has no business in the admin portal.
    await open(page, `${STAFF}/admin`);
    await expect(page).toHaveURL(`${STAFF}/delivery`);
    await page.close();
  });

  test('customer sees the delivered status; admin records the cash handover', async ({ browser }) => {
    const customer = await session(browser, 'customer');
    await open(customer, `${STORE}/orders`);
    await expect(customer.getByText('Delivered').first()).toBeVisible();
    await customer.close();

    const page = await session(browser, 'admin');
    await open(page, `${STAFF}/admin/people`);
    await page.getByRole('button', { name: 'Cash' }).first().click();
    await expect(page.getByText('Cash held')).toBeVisible();
    const held = page.locator('.group.small strong.mono');
    await expect(held).not.toHaveText(/^\D*0(\.00)?$/);
    await page.getByLabel('Cash received (tk)').fill('10');
    await page.getByRole('button', { name: 'Record handover' }).click();
    await expect(page.getByText('Handed over').locator('..')).toContainText('10');
    await page.close();
  });

  test('bKash order: paying, then cancelling, refunds exactly once', async ({ browser }) => {
    const page = await session(browser, 'customer');
    await addAndCheckout(page);
    await page.getByRole('radio', { name: /Hall 1/ }).click();
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('radio').filter({ hasText: /\d/ }).first().click();
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByText('bKash', { exact: true }).click();
    await page.getByRole('button', { name: 'Pay with bKash' }).click();
    await page.locator('#pay').click();
    await expect(page).toHaveURL(new RegExp(`^${STORE}`));
    await expect(page.getByText(/bKash · Paid/)).toBeVisible();
    await open(page, `${STORE}/orders`);
    const bkashCode = (await page.locator('.mono').filter({ hasText: /-|[A-Z]{2}/ }).first().innerText()).trim();
    await page.close();

    const admin = await session(browser, 'admin');
    await moveOrder(admin, 'Placed', bkashCode, 'Cancelled');
    await admin.getByLabel('Status').selectOption({ label: 'Cancelled' });
    const row = admin.getByRole('button', { name: new RegExp(bkashCode) });
    await expect(row).toContainText('Refund due');
    await row.click();
    await admin.getByRole('button', { name: 'Refund bKash payment' }).click();
    await expect(row).not.toContainText('Refund due');
    await row.click();
    await expect(admin.getByText(/Refunded/)).toBeVisible();
    await expect(admin.getByRole('button', { name: 'Refund bKash payment' })).toHaveCount(0);
    await admin.close();
  });

  test('emergency order shows its fee when emergency hours are open', async ({ browser }) => {
    const page = await session(browser, 'customer');
    await addAndCheckout(page);
    await page.getByRole('radio', { name: /Hall 1/ }).click();
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByText('Emergency', { exact: true }).click();
    const closed = await page.getByText('Emergency delivery is closed').isVisible();
    test.skip(closed, 'Run happened outside emergency hours');
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByText('Emergency fee')).toBeVisible();
    await page.getByRole('button', { name: 'Place order' }).click();
    await expect(page).toHaveURL(/\/orders\/[a-z0-9]+/);
    await expect(page.getByText('Arrives in')).toBeVisible();
    await page.close();
  });

  test('customer pays for a doctor; the doctor completes the call', async ({ browser }) => {
    const page = await session(browser, 'customer');
    await open(page, `${STORE}/doctors`);
    await page.getByRole('button', { name: 'Book a call' }).first().click();
    await page.getByLabel('Choose a time').selectOption({ index: 1 });
    await page.getByLabel(/What would you like/).fill('Fever for three days');
    await page.getByRole('button', { name: /Pay .* with bKash/ }).click();
    await page.locator('#pay').click();
    await expect(page).toHaveURL(new RegExp(`^${STORE}`));
    await open(page, `${STORE}/doctors/bookings`);
    await expect(page.getByText('Confirmed').first()).toBeVisible();
    await page.close();

    const doctor = await session(browser, 'doctor');
    await open(doctor, STAFF);
    await signIn(doctor, PHONE.doctor);
    await expect(doctor.getByText('Fever for three days')).toBeVisible();
    await doctor.getByLabel('Private notes (optional)').fill('Advised rest');
    await doctor.getByRole('button', { name: 'Mark completed' }).click();
    await expect(doctor.getByText('Completed')).toBeVisible();

    await open(doctor, `${STAFF}/doctor/availability`);
    const before = await doctor.getByRole('button', { name: 'Remove' }).count();
    await doctor.getByRole('button', { name: 'Add hours' }).click();
    await doctor.getByRole('button', { name: 'Save' }).click();
    await expect(doctor.getByText('Saved.')).toBeVisible();
    await doctor.reload();
    await expect(doctor.getByRole('button', { name: 'Remove' })).toHaveCount(before + 1);
    await doctor.close();
  });

  test('admin manages medicines, stock, zones, fees, staff and doctors', async ({ browser }) => {
    const page = await session(browser, 'admin');
    await open(page, `${STAFF}/admin/medicines`);
    await expect(page.getByText(/\d+ in stock/).first()).toBeVisible();
    await page.getByRole('button', { name: 'Add medicine' }).click();
    await page.getByLabel('Brand name').fill('Testamol');
    await page.getByLabel('Generic name').fill('Testacetamol');
    await page.getByLabel('Strength').fill('500 mg');
    await page.getByLabel('Price (tk)').fill('12.50');
    await page.getByRole('button', { name: 'Save' }).click();
    await page.getByLabel('Search medicines').fill('Testamol');
    await page.getByRole('button', { name: /Testamol/ }).click();
    await expect(page.getByLabel('Price (tk)')).toHaveValue('12.50');
    await page.getByLabel('Batch number').fill('B-1');
    await page.getByLabel('Quantity').fill('25');
    await page.getByLabel('Expiry date').fill('2030-01-31');
    await page.getByRole('button', { name: 'Add stock' }).click();
    await expect(page.getByRole('button', { name: /Testamol.*25 in stock/ })).toBeVisible();

    await open(page, `${STAFF}/admin/settings`);
    await page.getByLabel('Zone name').fill('Test Zone');
    await page.getByLabel('Delivery fee in taka').fill('55');
    await page.getByRole('button', { name: 'Add zone' }).click();
    await expect(page.getByText('Test Zone')).toBeVisible();
    await page.getByLabel('Emergency fee (tk)').fill('120');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Saved.')).toBeVisible();
    await page.reload();
    await expect(page.getByLabel('Emergency fee (tk)')).toHaveValue('120');

    await open(page, `${STAFF}/admin/people`);
    await page.getByRole('button', { name: 'Add staff' }).click();
    await page.getByLabel('Name').fill('Second Rider');
    await page.getByLabel('Mobile number').fill('01722222222');
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(page.getByText('Second Rider')).toBeVisible();

    await page.getByRole('button', { name: 'Onboard doctor' }).click();
    await page.getByLabel('Name').fill('Dr Test Onboard');
    await page.getByLabel('Mobile number').fill('01733333333');
    await page.getByLabel('BMDC number').fill('A-99999');
    await page.getByLabel('Specialty').fill('Medicine');
    await page.getByLabel('Meet link').fill('https://meet.google.com/abc-defg-hij');
    await page.getByRole('button', { name: 'Onboard', exact: true }).click();
    await expect(page.getByText('Dr Test Onboard')).toBeVisible();
    await open(page, `${STAFF}/admin/consultations`);
    await expect(page.getByText('Completed').first()).toBeVisible();
    await page.close();
  });

  for (const width of [320, 390, 1280]) {
    test(`no sideways scrolling at ${width}px on any screen`, async ({ browser }) => {
      const shots = resolve(RUN, 'shots');
      mkdirSync(shots, { recursive: true });
      const routes: [keyof typeof PHONE, string[]][] = [
        ['customer', ['/', '/search', '/cart', '/orders', '/doctors', '/doctors/bookings', '/account'].map((p) => STORE + p)],
        ['admin', ['/admin', '/admin/medicines', '/admin/consultations', '/admin/people', '/admin/settings'].map((p) => STAFF + p)],
        ['rider', ['/delivery', '/delivery/earnings'].map((p) => STAFF + p)],
        ['doctor', ['/doctor', '/doctor/availability'].map((p) => STAFF + p)],
      ];
      const wide: string[] = [];
      for (const [who, urls] of routes) {
        const page = await session(browser, who);
        await page.setViewportSize({ width, height: 800 });
        for (const url of urls) {
          await open(page, url);
          await page.waitForLoadState('networkidle');
          const over = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
          if (over > 0) wide.push(`${url} by ${over}px`);
          await page.screenshot({ path: resolve(shots, `${width}-${who}-${url.split('/').slice(3).join('_') || 'home'}.png`) });
        }
        await page.close();
      }
      expect(wide).toEqual([]);
    });
  }

  test('no script errors anywhere in the run', () => {
    expect(problems).toEqual([]);
  });
});
