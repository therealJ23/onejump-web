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

test('a phone set to Spanish gets the landing page in Spanish and light, with no language switch on the page', async ({ browser }) => {
  const ctx = await browser.newContext({ locale: 'es-DO', colorScheme: 'dark' });
  const page = await ctx.newPage();
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'es');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.getByRole('link', { name: 'Empezar prueba gratis' }).first()).toBeVisible();
  await expect(page.locator('.lang-switch')).toHaveCount(0);
  await page.goto('/signup');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await ctx.close();
});

test('coach Settings switches the workspace to Spanish', async ({ page }) => {
  const { coachLogin } = await import('./helpers.js');
  await coachLogin(page);
  await page.goto('/app/settings');
  await page.locator('#sp-lang').selectOption('es');
  await page.waitForURL('**/app/settings');
  await expect(page.locator('.rail')).toContainText('Clientes');
  await expect(page.locator('header [data-act="copilot"]')).toContainText('Pregúntale a Assist');
  await page.locator('#sp-lang').selectOption('en');
  await expect(page.locator('.rail')).toContainText('Clients');
});
