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
