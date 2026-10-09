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
