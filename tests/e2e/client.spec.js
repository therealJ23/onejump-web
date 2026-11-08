// Client app: log in with an email link, log a workout, send a check-in, message the coach.
import { test, expect } from '@playwright/test';
import { watchErrors, clientLogin, openWorkoutId } from './helpers.js';

test('client opens the app from a login link and logs a workout @phone', async ({ page }) => {
  const done = watchErrors(page);
  await clientLogin(page);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Mike');
  await page.goto(`/client/workout/${await openWorkoutId(page)}`);
  await page.getByRole('button', { name: 'Set 1 done' }).first().click();
  await expect(page.getByRole('timer')).toBeVisible();
  await page.getByRole('button', { name: 'Skip' }).click();
  await page.reload(); // progress is kept on the phone
  await expect(page.getByRole('button', { name: 'Set 1 done' }).first()).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('link', { name: 'Finish workout' }).click();
  await page.getByRole('radio', { name: '7' }).first().click();
  await page.getByLabel('Anything for your coach?').fill('Felt good');
  await page.getByRole('button', { name: 'Save workout' }).click();
  await expect(page.getByRole('heading', { name: /Workout #\d+ done/ })).toBeVisible();
  done();
});

test('client sends a weekly check-in and a message @phone', async ({ page }) => {
  await clientLogin(page);
  await page.goto('/client/checkin');
  await page.getByLabel('How was your week?').fill('Solid week, slept better.');
  await page.getByRole('button', { name: 'Send to your coach' }).click();
  await page.waitForURL('**/client');
  await page.getByRole('link', { name: 'Coach' }).click();
  await page.getByLabel('Message your coach').fill('See you Thursday!');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.locator('.bubble.me').last()).toContainText('See you Thursday!');
});

test('client changes their profile photo and the coach sees it @phone', async ({ page, browser }) => {
  const done = watchErrors(page);
  await clientLogin(page);
  await page.goto('/client/me');
  await page.locator('input[data-change="photo"]').setInputFiles('tests/fixtures/face.jpg');
  await expect(page.locator('.av.has-photo img')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Remove', exact: true })).toBeVisible();
  // The coach's client list shows the photo.
  const coach = await browser.newPage();
  await coach.goto('/login');
  await coach.locator('body[data-ready="1"]').waitFor();
  await coach.getByLabel('Email', { exact: true }).fill('dani@reyesstrength.com');
  await coach.getByLabel('Password').fill('onejump-demo-2026');
  await coach.getByRole('button', { name: 'Log in' }).click();
  await coach.waitForURL('**/app');
  await coach.goto('/app/clients');
  await expect(coach.locator('.av.has-photo img').first()).toBeVisible();
  await coach.close();
  await page.getByRole('button', { name: 'Remove', exact: true }).click();
  await expect(page.locator('.av.has-photo')).toHaveCount(0);
  done();
});
