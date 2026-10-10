// Voice in the browser: dictation, Talk to Assist, client voice (set logging), with a fake
// speech recognizer / microphone so the tests don't need real audio.
import { test, expect } from '@playwright/test';
import { watchErrors, coachLogin, clientLogin } from './helpers.js';

/** A stand-in for the browser's SpeechRecognition that "hears" a phrase (or fails). */
const fakeSpeech = (phrase, error = null) => `(() => {
  class FakeSR {
    start() {
      const p = ${JSON.stringify(phrase)}, err = ${JSON.stringify(error)};
      if (err) { setTimeout(() => { this.onerror?.({ error: err }); this.onend?.(); }, 30); return; }
      setTimeout(() => { const r = [{ transcript: p.split(' ').slice(0, 2).join(' ') }]; r.isFinal = false; this.onresult?.({ results: [r], resultIndex: 0 }); }, 40);
      setTimeout(() => { const r = [{ transcript: p }]; r.isFinal = true; this.onresult?.({ results: [r], resultIndex: 0 }); this.onend?.(); }, 160);
    }
    stop() { this.onend?.(); }
    abort() { this.onend?.(); }
  }
  window.SpeechRecognition = FakeSR; window.webkitSpeechRecognition = FakeSR;
})()`;
const noSpeech = '(() => { delete window.SpeechRecognition; delete window.webkitSpeechRecognition; })()';

async function mikeId(page) {
  const { clients } = await (await page.request.get('/api/clients')).json();
  return clients.find(c => c.name === 'Mike Torres').id;
}

test('dictation writes into the message box and sends nothing', async ({ page }) => {
  const done = watchErrors(page);
  await page.addInitScript(fakeSpeech('Great work this week, same weights on Thursday'));
  await coachLogin(page);
  const id = await mikeId(page);
  const before = (await (await page.request.get(`/api/threads/${id}`)).json()).messages.length;
  await page.goto(`/app/inbox/${id}`);
  await page.locator('[data-dictate][data-target="msg-text"]').click();
  await expect(page.locator('#msg-text')).toHaveValue('Great work this week, same weights on Thursday');
  await page.waitForTimeout(400);
  const after = (await (await page.request.get(`/api/threads/${id}`)).json()).messages.length;
  expect(after).toBe(before);
  done();
});

test('the dictation button is hidden where speech recognition is unsupported', async ({ page }) => {
  await page.addInitScript(noSpeech);
  await coachLogin(page);
  await page.goto(`/app/inbox/${await mikeId(page)}`);
  await expect(page.locator('#msg-text')).toBeVisible();
  await expect(page.locator('[data-dictate][data-target="msg-text"]')).toBeHidden();
  await page.locator('#msg-text').fill('Typing still works');
  await expect(page.locator('#msg-text')).toHaveValue('Typing still works');
});

test('denied microphone: dictation shows the message and typing still works', async ({ page }) => {
  await page.addInitScript(fakeSpeech('', 'not-allowed'));
  await coachLogin(page);
  await page.goto(`/app/inbox/${await mikeId(page)}`);
  await page.locator('[data-dictate][data-target="msg-text"]').click();
  await expect(page.getByText('Microphone access is off. Turn it on in your browser settings to use voice.')).toBeVisible();
  await page.locator('#msg-text').fill('Typed instead');
  await expect(page.locator('#msg-text')).toHaveValue('Typed instead');
});

test('the client can dictate a message to their coach @phone', async ({ page }) => {
  await page.addInitScript(fakeSpeech('Can we move Friday to seven'));
  await clientLogin(page);
  await page.goto('/client/chat');
  await page.locator('[data-dictate][data-target="cchat-in"]').click();
  await expect(page.locator('#cchat-in')).toHaveValue('Can we move Friday to seven');
});

// A working microphone (a quiet tone) and a denied one.
const fakeMic = `(() => { navigator.mediaDevices.getUserMedia = async () => { const ctx = new AudioContext(); const o = ctx.createOscillator(); const g = ctx.createGain(); g.gain.value = 0.2; const d = ctx.createMediaStreamDestination(); o.connect(g).connect(d); o.start(); return d.stream; }; })()`;
const deniedMic = `(() => { navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('Permission denied', 'NotAllowedError'); }; })()`;

test('Talk to Assist: push to talk, a confirmation card, and nothing sent until Confirm', async ({ page }) => {
  const done = watchErrors(page);
  await page.addInitScript(fakeSpeech('Send Marcus the drafted message'));
  await page.addInitScript(fakeMic);
  await coachLogin(page);
  const { clients } = await (await page.request.get('/api/clients')).json();
  const marcus = clients.find(c => c.name === 'Marcus Johnson').id;
  const count = async () => (await (await page.request.get(`/api/threads/${marcus}`)).json()).messages.length;
  const before = await count();
  await page.locator('header [data-act="talk"]').click();
  await page.locator('#v-orb').click();
  await expect(page.locator('.rec-dot')).toBeVisible();
  await page.waitForTimeout(600);
  await page.locator('#v-orb').click();
  const card = page.locator('.proposal');
  await expect(card).toContainText('Marcus Johnson');
  expect(await count()).toBe(before);
  await card.getByRole('button', { name: /Confirm/ }).click();
  await expect(card).toContainText('You confirmed it on screen.');
  expect(await count()).toBe(before + 1);
  done();
});

test('Talk to Assist with the microphone off: clear message, and typing still works', async ({ page }) => {
  await page.addInitScript(deniedMic);
  await coachLogin(page);
  await page.locator('header [data-act="talk"]').click();
  await page.locator('#v-orb').click();
  await expect(page.locator('#v-said')).toHaveText('Microphone access is off. Turn it on in your browser settings to use voice.');
  await page.locator('#v-type').fill('Which clients haven’t paid?');
  await page.locator('#v-form button[type="submit"]').click();
  await expect(page.locator('#v-answer')).not.toBeEmpty();
  await expect(page.locator('#v-answer .thinking')).toHaveCount(0);
});
