// Voice in the browser: dictation, Talk to Assist, client voice (set logging), with a fake
// speech recognizer / microphone so the tests don't need real audio.
import { test, expect } from '@playwright/test';
import { watchErrors, coachLogin, clientLogin, openWorkoutId } from './helpers.js';

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
/** Hands-free: the first time the mic opens it "talks" for 0.8 s and then goes quiet; later it stays quiet. */
const talkOnceMic = `(() => { let n = 0; navigator.mediaDevices.getUserMedia = async () => { const ctx = new AudioContext(); await ctx.resume(); const o = ctx.createOscillator(); const g = ctx.createGain(); g.gain.value = n++ === 0 ? 0.3 : 0; g.gain.setValueAtTime(0, ctx.currentTime + 0.8); const d = ctx.createMediaStreamDestination(); o.connect(g).connect(d); o.start(); return d.stream; }; })()`;
const deniedMic = `(() => { navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('Permission denied', 'NotAllowedError'); }; })()`;

test('Talk to Assist is hands-free: it listens on open, sends when you stop talking, and nothing is sent until Confirm', async ({ page }) => {
  const done = watchErrors(page);
  await page.addInitScript(fakeSpeech('Send Marcus the drafted message'));
  await page.addInitScript(talkOnceMic);
  await coachLogin(page);
  const { clients } = await (await page.request.get('/api/clients')).json();
  const marcus = clients.find(c => c.name === 'Marcus Johnson').id;
  const count = async () => (await (await page.request.get(`/api/threads/${marcus}`)).json()).messages.length;
  const before = await count();
  await page.locator('header [data-act="talk"]').click(); // the only tap
  await expect(page.locator('#v-rec .rec-dot')).toHaveText('Listening'); // visible while the mic is on, no timer
  const card = page.locator('.proposal');
  await expect(card).toContainText('Marcus Johnson', { timeout: 10000 }); // sent on its own after the pause
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
  await expect(page.locator('#v-said')).toHaveText('Microphone access is off. Turn it on in your browser settings to use voice.');
  await page.locator('#v-type').fill('Which clients haven’t paid?');
  await page.locator('#v-form button[type="submit"]').click();
  await expect(page.locator('#v-answer')).not.toBeEmpty();
  await expect(page.locator('#v-answer .thinking')).toHaveCount(0);
});

test('client: “10 reps at 55” fills the next set; Undo restores it @phone', async ({ page }) => {
  const done = watchErrors(page);
  await page.addInitScript(fakeSpeech('10 reps at 55'));
  await clientLogin(page);
  await page.goto(`/client/workout/${await openWorkoutId(page)}`);
  const row = page.locator('[data-row="0-0"]');
  const reps = row.locator('[data-f="r"]'), weight = row.locator('[data-f="w"]'), check = row.locator('[data-act="setDone"]');
  const before = { reps: await reps.inputValue(), weight: await weight.inputValue() };
  await expect(check).toHaveAttribute('aria-pressed', 'false');
  await page.getByRole('button', { name: /Log next set by voice/ }).click();
  await expect(check).toHaveAttribute('aria-pressed', 'true');
  await expect(reps).toHaveValue('10');
  await expect(weight).toHaveValue('55');
  await expect(page.locator('.toast')).toContainText('set 1: 55 lb × 10');
  await page.locator('.toast').getByRole('button', { name: 'Undo' }).click();
  await expect(check).toHaveAttribute('aria-pressed', 'false');
  await expect(reps).toHaveValue(before.reps);
  await expect(weight).toHaveValue(before.weight);
  done();
});

test('client voice note: recording bar, Send, and the transcript in the thread @phone', async ({ page }) => {
  const done = watchErrors(page);
  await page.addInitScript(fakeSpeech('My knee hurts after the squats yesterday. Should I skip lunges tomorrow?'));
  await page.addInitScript(fakeMic);
  await clientLogin(page);
  await page.goto('/client/chat');
  await page.getByRole('button', { name: 'Record a voice note' }).click();
  await expect(page.locator('.vnote-rec .rec-dot')).toContainText('Recording');
  await page.waitForTimeout(1200);
  await page.getByRole('button', { name: 'Send voice note' }).click();
  await expect(page.locator('.bubble.me.voice').last()).toContainText('My knee hurts after the squats yesterday');
  await expect(page.locator('.vnote-rec')).toHaveCount(0);
  await expect(page.locator('#cchat-in')).toBeVisible();
  done();
});

test('coach hears the voice note with the transcript, Assist summary and health flag', async ({ page }) => {
  const done = watchErrors(page);
  await coachLogin(page);
  const id = await mikeId(page);
  await page.goto(`/app/inbox/${id}`);
  const note = page.locator('.bubble.them.voice').last();
  await expect(note).toContainText('My knee hurts');
  await expect(note.locator('.vnote-sum')).toContainText(/skip lunges/i);
  await expect(note.locator('.vnote-flag')).toContainText('Health flag: mentions hurts');
  await note.getByRole('button', { name: /Play voice note/ }).click();
  await expect(note.getByRole('button', { name: 'Pause voice note' })).toBeVisible();
  done();
});

test('voice food logging without browser speech recognition: records, transcribes on the server, then review @phone', async ({ page }) => {
  const done = watchErrors(page);
  await page.addInitScript(noSpeech);
  await page.addInitScript(fakeMic);
  await clientLogin(page);
  await page.goto('/client/nutrition');
  await page.getByRole('button', { name: /Log food/ }).first().click();
  await page.locator('[data-pick="voice"]').click();
  await page.locator('#vf-orb').click();
  await expect(page.locator('#vf-msg .rec-dot')).toBeVisible();
  await page.waitForTimeout(900);
  await page.locator('#vf-orb').click();
  await expect(page.locator('#vf-text')).not.toHaveValue('');
  await page.getByRole('button', { name: 'Find foods' }).click();
  await expect(page.getByRole('button', { name: /^Add/ }).first()).toBeVisible();
  done();
});

/** Instant speech so the briefing plays through quickly in tests. */
const fastSpeech = `(() => { const s = window.speechSynthesis; if (!s) return; s.speak = u => { window.__spoken = (window.__spoken || []).concat(u.text); setTimeout(() => u.onend?.(), 60); }; s.cancel = () => {}; })()`;

test('morning briefing: Today → Play reads it line by line', async ({ page }) => {
  const done = watchErrors(page);
  await page.addInitScript(fastSpeech);
  await coachLogin(page);
  await page.locator('.page-head [data-act="briefing"]').click();
  const lines = page.locator('#br-lines li');
  await expect(lines.first()).toContainText('Good morning, Dani.');
  await page.getByRole('button', { name: 'Play briefing' }).click();
  await expect(page.getByRole('button', { name: 'Play again' })).toBeVisible({ timeout: 10000 });
  const spoken = await page.evaluate(() => window.__spoken || []);
  expect(spoken.length).toBe(await lines.count());
  expect(spoken.join(' ')).not.toMatch(/knee|pain|hurt/i);
  expect((await (await page.request.get('/api/briefing/status')).json()).ready).toBe(false);
  done();
});

test('“Start my morning briefing” in Talk to Assist opens and plays it', async ({ page }) => {
  await page.addInitScript(fastSpeech);
  await coachLogin(page);
  await page.locator('header [data-act="talk"]').click();
  await page.locator('#v-type').fill('Start my morning briefing');
  await page.locator('#v-form button[type="submit"]').click();
  await expect(page.locator('#br-lines li').first()).toContainText('Good morning');
  await expect(page.getByRole('button', { name: /Stop|Play again/ })).toBeVisible();
});
