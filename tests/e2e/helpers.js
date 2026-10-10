import { expect } from '@playwright/test';

/** Console errors except blocked web fonts (the sandbox has no internet). */
export function watchErrors(page) {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/fonts\.(googleapis|gstatic)|ERR_TUNNEL|ERR_NAME_NOT_RESOLVED|net::ERR_/.test(m.text() + (m.location()?.url || ''))) errors.push(m.text()); });
  return () => expect(errors, errors.join('\n')).toEqual([]);
}
export async function coachLogin(page, email = 'dani@reyesstrength.com') {
  await page.goto('/login');
  await page.locator('body[data-ready="1"]').waitFor();
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password').fill('onejump-demo-2026');
  await page.getByRole('button', { name: 'Log in' }).click();
  await page.waitForURL('**/app');
  await page.locator('#view h1').first().waitFor();
}
export async function clientLogin(page, email = 'mike.t@example.com') {
  await page.goto('/login?as=client');
  await page.locator('body[data-ready="1"]').waitFor();
  await page.getByLabel('Your email').fill(email);
  await page.getByRole('button', { name: /Email me a login link/ }).click();
  await expect(page.getByRole('status')).toContainText('login link');
  const box = await (await page.request.get('/api/dev/outbox')).json();
  const link = box.emails.find(e => e.to === email && e.link).link;
  await page.goto(new URL(link).pathname + new URL(link).search);
  await page.waitForURL('**/client');
}

/** An assignment the signed-in client can log right now (independent of the weekday). */
export async function openWorkoutId(page) {
  const today = await (await page.request.get('/api/me/today')).json();
  const a = today.today?.status === 'scheduled' ? today.today : today.next;
  if (a) return a.assignmentId;
  const csrf = (await (await page.request.get('/api/auth/csrf')).json()).csrfToken;
  return (await (await page.request.post('/api/dev/open-workout', { headers: { 'X-CSRF-Token': csrf } })).json()).assignmentId;
}
