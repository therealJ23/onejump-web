// Client app: log in with an email link, log a workout, send a check-in, message the coach.
import { test, expect } from '@playwright/test';
import { watchErrors, clientLogin } from './helpers.js';

test('client opens the app from a login link and logs a workout @phone', async ({ page }) => {
  const done = watchErrors(page);
  await clientLogin(page);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Mike');
  const today = await (await page.request.get('/api/me/today')).json();
  const a = today.today?.status === 'scheduled' ? today.today : today.next;
  await page.goto(`/client/workout/${a.assignmentId}`);
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
