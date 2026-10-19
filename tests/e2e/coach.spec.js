// Coach workspace: log in, work the Today queue, open a client, review a check-in, message.
import { test, expect } from '@playwright/test';
import { watchErrors, coachLogin } from './helpers.js';

test('coach logs in and sees the Today queue', async ({ page }) => {
  const done = watchErrors(page);
  await coachLogin(page);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Dani');
  await expect(page.getByText(/things? need you|all caught up/).first()).toBeVisible();
  await expect(page.getByText('Marcus Johnson may cancel')).toBeVisible();
  done();
});

test('approving an at-risk draft sends it and can be undone', async ({ page }) => {
  await coachLogin(page);
  await page.goto('/app/clients');
  await page.getByRole('link', { name: /Marcus Johnson/ }).first().click();
  await expect(page.getByText('Client at risk')).toBeVisible();
  await page.getByRole('button', { name: /Approve & send/ }).click();
  await expect(page.getByText(/Sent to Marcus/)).toBeVisible();
  await page.getByRole('button', { name: 'Undo' }).click();
  await page.reload();
  await expect(page.getByRole('button', { name: /Approve & send/ })).toBeVisible();
});

test('reviewing a check-in with pain shows the referral and sends the reply', async ({ page }) => {
  const done = watchErrors(page);
  await coachLogin(page);
  await page.goto('/app/checkins');
  await expect(page.getByText('Pain reported.')).toBeVisible();
  const reply = page.getByLabel(/Reply to Chris/);
  await expect(reply).toHaveValue(/physical therapist|sports-medicine/);
  await page.getByRole('button', { name: /Send reply & mark reviewed/ }).click();
  await expect(page.getByText(/Reply sent to Chris/)).toBeVisible();
  done();
});

test('Assist drafts a message only into the box; the coach sends it', async ({ page }) => {
  await coachLogin(page);
  await page.goto('/app/inbox');
  await page.getByRole('link', { name: /Mike Torres/ }).first().click();
  const box = page.getByLabel(/Message to Mike Torres/);
  await page.getByRole('button', { name: 'Motivational' }).click();
  await expect(box).not.toHaveValue('');
  await expect(page.getByText('Assist draft. Edit anything before you send.')).toBeVisible();
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.locator('.bubble.me').last()).toContainText(/Assist draft|edited from an Assist draft/);
});

test('builder: add an exercise and it autosaves @phone', async ({ page }) => {
  await coachLogin(page);
  await page.goto('/app/builder');
  await page.getByRole('button', { name: /New workout/ }).click();
  await page.waitForURL(/\/app\/builder\/.+/);
  await page.getByPlaceholder(/Search \d+ exercises/).fill('goblet');
  await page.getByRole('button', { name: 'Add Goblet squat' }).click();
  await expect(page.locator('#save-state')).toHaveText('Saved', { timeout: 6000 });
  await page.reload();
  await expect(page.getByText('Goblet squat').first()).toBeVisible();
});

test('Today and Payments show the business charts; hovering a month shows its value', async ({ page }) => {
  const done = watchErrors(page);
  await coachLogin(page);
  const biz = page.locator('section[aria-labelledby="biz-h"]');
  await expect(biz.getByRole('heading', { name: 'Your business' })).toBeVisible();
  for (const h of ['Revenue by month', 'Workout adherence', 'Revenue by package', 'Active clients']) await expect(biz.getByText(h)).toBeVisible();
  await biz.locator('.bar-g').last().hover();
  await expect(biz.locator('.bar-g').last().locator('.bar-v')).toBeVisible();
  if (process.env.SHOTS) await biz.screenshot({ path: `${process.env.SHOTS}/biz-today.png` });
  await page.goto('/app/payments');
  await expect(page.getByText('Revenue by month')).toBeVisible();
  await expect(page.getByText('Revenue by package')).toBeVisible();
  done();
});

test('Nutrition: Assist builds a plan from the client’s details; nothing is saved until “Use this plan”', async ({ page }) => {
  const done = watchErrors(page);
  await coachLogin(page);
  const { clients } = await (await page.request.get('/api/clients')).json();
  const grace = clients.find(c => c.name === 'Grace Owens');
  await page.goto(`/app/clients/${grace.id}/nutrition`);
  const box = page.locator('#nt-assist');
  await expect(box.getByText('Build a plan with Assist')).toBeVisible();
  await box.locator('#nt-ask').fill('simple meals, a meal plan please');
  await box.getByRole('button', { name: 'Build plan' }).click();
  const draft = page.locator('#nt-draft-card');
  await expect(draft).toBeVisible({ timeout: 15000 });
  await expect(draft).toContainText('Draft · only you see this');
  if (process.env.SHOTS) await page.locator('#nt-assist').screenshot({ path: `${process.env.SHOTS}/nutrition-draft.png` });
  const before = (await (await page.request.get(`/api/clients/${grace.id}/nutrition-plan`)).json()).plan;
  await draft.getByRole('button', { name: 'Use this plan' }).click();
  await expect(page.getByText(/nutrition plan is saved/)).toBeVisible();
  const after = (await (await page.request.get(`/api/clients/${grace.id}/nutrition-plan`)).json()).plan;
  expect(after.updatedAt).not.toBe(before.updatedAt);
  done();
});

test('Business insights: forecast for the month, how it is built, and the trend charts', async ({ page }) => {
  const done = watchErrors(page);
  await coachLogin(page);
  await page.getByRole('link', { name: 'Insights & forecast' }).click();
  await page.waitForURL('**/app/business');
  await expect(page.getByRole('heading', { level: 1, name: 'Business insights' })).toBeVisible();
  for (const h of ['Expected this month', 'Collected so far', 'Monthly recurring', 'Monthly churn']) await expect(page.locator('.kpis').getByText(h)).toBeVisible();
  for (const h of [/forecast$/, 'How the forecast is built', 'Revenue by month', 'Clients gained and lost', 'Revenue at risk', 'Client engagement', 'Client value', /^Leads/]) await expect(page.getByRole('heading', { level: 2, name: h })).toBeVisible();
  await expect(page.getByText('What stands out')).toBeVisible();
  // The table's expected total matches the headline number.
  const headline = await page.locator('.kpis .kpi').first().locator('.big-num').textContent();
  await expect(page.locator('.breakdown tfoot td.strong')).toHaveText(headline);
  // Hovering a day on the forecast shows a tooltip.
  const day = page.locator('#ins-forecast .day-g').last();
  await day.locator('.hit').hover();
  await expect(day.locator('.tip')).toHaveCSS('opacity', '1');
  await expect(day.locator('.tip')).toContainText('Expected');
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/business.png`, fullPage: true });
  done();
});

test('Business insights on a phone @phone', async ({ page }) => {
  const done = watchErrors(page);
  await coachLogin(page);
  await page.goto('/app/business');
  await expect(page.getByRole('heading', { level: 1, name: 'Business insights' })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/business-phone.png`, fullPage: true });
  done();
});

test('HQ shows OneJump’s plan-revenue forecast and trends to the platform admin', async ({ page }) => {
  const done = watchErrors(page);
  await page.goto('/login');
  await page.locator('body[data-ready="1"]').waitFor();
  await page.getByLabel('Email', { exact: true }).fill('ops@onejumpfit.com');
  await page.getByLabel('Password').fill('onejump-demo-2026');
  await page.getByRole('button', { name: 'Log in' }).click();
  await page.waitForURL(/\/(admin|app)/);
  await page.goto('/admin');
  await expect(page.getByRole('heading', { level: 1, name: 'Platform overview' })).toBeVisible();
  await expect(page.locator('.kpis').getByText('Plan revenue this month')).toBeVisible();
  for (const h of [/Plan revenue: .+ forecast/, 'How the forecast is built', 'MRR by month', 'Paying coaches gained and lost', /Sign-up funnel/, 'AI cost by month']) await expect(page.getByRole('heading', { level: 2, name: h })).toBeVisible();
  await expect(page.getByText('Client names and details hidden')).toBeVisible();
  done();
});
