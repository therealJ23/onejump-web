// Public pages: landing, pricing, booking page and sign-up into onboarding.
import { test, expect } from '@playwright/test';
import { watchErrors } from './helpers.js';

test('landing and pricing load without errors @phone', async ({ page }) => {
  const done = watchErrors(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Get 9 hours back');
  await page.getByRole('link', { name: 'Start free for 14 days' }).first().click();
  await page.waitForURL('**/signup');
  await page.goto('/pricing');
  await expect(page.getByText('$59')).toBeVisible();
  done();
});

test('a new coach signs up and finishes onboarding', async ({ page }) => {
  await page.goto('/signup');
  await page.getByLabel('Full name').fill('Robin Hale');
  await page.getByLabel(/Business name/).fill('Hale Fitness');
  await page.getByLabel('Work email').fill(`robin.${Date.now()}@example.com`);
  await page.getByLabel('Password').fill('a-long-password-1');
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.waitForURL('**/onboarding');
  for (let i = 0; i < 9; i++) await page.getByRole('button', { name: /Continue/ }).click();
  await page.getByRole('button', { name: /Set up my workspace/ }).click();
  await expect(page.getByRole('heading', { name: /Welcome, Robin/ })).toBeVisible();
  await page.getByRole('link', { name: /Go to my workspace/ }).click();
  await page.waitForURL('**/app');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
});

test('booking page sends a consultation request', async ({ page }) => {
  await page.goto('/coach/dani');
  await expect(page.getByRole('heading', { name: 'Dani Reyes' })).toBeVisible();
  await page.getByRole('button', { name: 'Mon' }).click();
  await page.getByLabel('Name').fill('Casey Lin');
  await page.getByLabel('Email').fill('casey@example.com');
  await page.getByRole('button', { name: 'Request a call' }).click();
  await expect(page.getByText('Request sent')).toBeVisible();
});
