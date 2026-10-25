// Faster Assist (Oct 25): Haiku 5.5 with thinking off, streaming, longer prompt cache, warm-up,
// the day snapshot, and understanding misheard names.
import { describe, it, expect, beforeAll } from 'vitest';
import { fixtures, loginCoach } from './helpers.js';

let f, dani;
beforeAll(async () => { f = await fixtures(); dani = await loginCoach(); });

const sse = events => {
  const enc = new TextEncoder();
  const text = events.map(e => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join('');
  // Split in awkward places to prove the reader joins chunks.
  const chunks = [text.slice(0, 37), text.slice(37, 200), text.slice(200)];
  return new ReadableStream({ start(c) { for (const ch of chunks) c.enqueue(enc.encode(ch)); c.close(); } });
};

describe('Claude connection: faster model, streaming, caching', () => {
  it('turns thinking off on Haiku 5.5 and caches tools + instructions for an hour', async () => {
    const { AnthropicProvider } = await import('../server/ai/providers/anthropic.js');
    let sent;
    const p = new AnthropicProvider({ apiKey: 'x', model: 'claude-haiku-5-5', fetchImpl: async (_u, o) => { sent = JSON.parse(o.body); return { ok: true, status: 200, json: async () => ({ content: [], usage: { input_tokens: 10, cache_read_input_tokens: 1000, cache_creation: { ephemeral_1h_input_tokens: 100, ephemeral_5m_input_tokens: 20 }, cache_creation_input_tokens: 120, output_tokens: 5 } }) }; } });
    const r = await p.chat({ system: 'fixed', systemExtra: 'today', messages: [{ role: 'user', content: 'hi' }], tools: [{ name: 'a', input_schema: {} }], cache: true, effort: 'low' });
    expect(sent.thinking).toEqual({ type: 'disabled' });
    expect(sent.output_config).toEqual({ effort: 'low' });
    expect(sent.system[0]).toMatchObject({ text: 'fixed', cache_control: { type: 'ephemeral', ttl: '1h' } });
    expect(sent.system[1]).toEqual({ type: 'text', text: 'today' });
    expect(sent.tools[0].cache_control).toEqual({ type: 'ephemeral', ttl: '1h' });
    expect(sent.messages[0].content[0].cache_control).toEqual({ type: 'ephemeral' });
    // 10 fresh + 20×1.25 + 100×2 + 1000×0.1 at $0.10/M in, 5 × $0.50/M out
    expect(r.usage.costMicros).toBe(Math.round(10 * 0.1 + 20 * 0.1 * 1.25 + 100 * 0.1 * 2 + 1000 * 0.1 * 0.1 + 5 * 0.5));
  });

  it('doesn’t send Haiku 5.5 options to older models', async () => {
    const { AnthropicProvider } = await import('../server/ai/providers/anthropic.js');
    let sent;
    const p = new AnthropicProvider({ apiKey: 'x', model: 'claude-haiku-4-5', fetchImpl: async (_u, o) => { sent = JSON.parse(o.body); return { ok: true, status: 200, json: async () => ({ content: [{ type: 'tool_use', name: 'respond_x', input: { ok: true } }], usage: {} }) }; } });
    await p.complete({ task: 'x', system: 's', prompt: 'p', schema: {} });
    expect(sent.thinking).toBeUndefined();
    expect(sent.output_config).toBeUndefined();
  });

  it('falls back to Haiku 4.5 once if the API key can’t use the newer model', async () => {
    const { AnthropicProvider } = await import('../server/ai/providers/anthropic.js');
    const models = [];
    const p = new AnthropicProvider({ apiKey: 'x', model: 'claude-haiku-5-5', fetchImpl: async (_u, o) => {
      const b = JSON.parse(o.body); models.push(b.model);
      if (b.model === 'claude-haiku-5-5') return { ok: false, status: 404, text: async () => '{"type":"error","error":{"type":"not_found_error","message":"model: claude-haiku-5-5"}}' };
      return { ok: true, status: 200, json: async () => ({ content: [{ type: 'text', text: 'hi' }], usage: {} }) };
    } });
    const r1 = await p.chat({ system: 's', messages: [{ role: 'user', content: 'hi' }] });
    const r2 = await p.chat({ system: 's', messages: [{ role: 'user', content: 'hi' }] });
    expect(r1.json.content[0].text).toBe('hi');
    expect(r2.json.content[0].text).toBe('hi');
    expect(models).toEqual(['claude-haiku-5-5', 'claude-haiku-4-5', 'claude-haiku-4-5']);
  });

  it('streams text pieces and rebuilds the full message, tool calls included', async () => {
    const { AnthropicProvider } = await import('../server/ai/providers/anthropic.js');
    const events = [
      { type: 'message_start', message: { model: 'claude-haiku-5-5', usage: { input_tokens: 12, cache_read_input_tokens: 900 } } },
      { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Looking ' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'now.' } },
      { type: 'content_block_stop', index: 0 },
      { type: 'content_block_start', index: 1, content_block: { type: 'tool_use', id: 't1', name: 'client_details', input: {} } },
      { type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: '{"name":' } },
      { type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: '"Maya"}' } },
      { type: 'content_block_stop', index: 1 },
      { type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 30 } },
      { type: 'message_stop' },
    ];
    let sent;
    const p = new AnthropicProvider({ apiKey: 'x', model: 'claude-haiku-5-5', fetchImpl: async (_u, o) => { sent = JSON.parse(o.body); return { ok: true, status: 200, body: sse(events) }; } });
    const pieces = [];
    const r = await p.chat({ system: 's', messages: [{ role: 'user', content: 'how is maya' }], onText: t => pieces.push(t) });
    expect(sent.stream).toBe(true);
    expect(pieces).toEqual(['Looking ', 'now.']);
    expect(r.json.stop_reason).toBe('tool_use');
    expect(r.json.content).toEqual([{ type: 'text', text: 'Looking now.' }, { type: 'tool_use', id: 't1', name: 'client_details', input: { name: 'Maya' } }]);
    expect(r.usage).toMatchObject({ outputTokens: 30, cachedTokens: 900 });
  });
});

describe('Ask Assist: streamed, parallel tools, snapshot', () => {
  it('streams the answer and the sentences to say, and runs a step’s tools together', async () => {
    const { ask, speechRemainder } = await import('../server/assist/AssistService.js');
    const { AI } = await import('../server/ai/AIService.js');
    const reqs = [];
    let inFlight = 0, maxInFlight = 0;
    const fake = { name: 'anthropic', model: 'fake', async chat(req) {
      reqs.push(req);
      if (reqs.length === 1) { req.onText?.('Let me check. '); return { model: 'fake', usage: {}, json: { stop_reason: 'tool_use', content: [{ type: 'text', text: 'Let me check.' }, { type: 'tool_use', id: 'a', name: 'client_details', input: { name: 'Marcus Johnson' } }, { type: 'tool_use', id: 'b', name: 'client_details', input: { name: 'Sarah Kim' } }] } }; }
      const text = 'Marcus is on track. Sarah missed two workouts. Want me to nudge her? Extra line here.';
      for (const piece of text.match(/.{1,9}/g)) req.onText?.(piece);
      return { model: 'fake', usage: {}, json: { stop_reason: 'end_turn', content: [{ type: 'text', text }] } };
    } };
    // Count tool runs happening at the same time.
    const { MORE_TOOLS } = await import('../server/assist/moreTools.js');
    const orig = MORE_TOOLS.client_details.run;
    MORE_TOOLS.client_details.run = async (...a) => { inFlight++; maxInFlight = Math.max(maxInFlight, inFlight); await new Promise(r => setTimeout(r, 30)); try { return await orig(...a); } finally { inFlight--; } };
    const before = AI.provider; AI.provider = fake;
    const events = [];
    try {
      const r = await ask(f.dbA, { userId: f.dani.id, businessId: f.A.id }, 'How are marcus and sarah?', { voice: true, emit: e => events.push(e), fast: true });
      expect(maxInFlight).toBe(2);
      expect(reqs[0].system).not.toMatch(/Today is/); // the date sits in the per-question part, so the fixed part stays cached
      expect(reqs[0].systemExtra).toMatch(/Today is/);
      expect(reqs[0].systemExtra).toMatch(/Marcus Johnson/); // snapshot with the client list
      expect(reqs[0].effort).toBe('low');
      expect(events.map(e => e.type)).toContain('reset');
      const says = events.filter(e => e.type === 'say').map(e => e.text);
      expect(says).toEqual(['Let me check.', 'Marcus is on track.', 'Sarah missed two workouts.', 'Want me to nudge her?']);
      expect(r.answerText).toMatch(/^Marcus is on track/);
      expect(r.streamedSay).toBe('Marcus is on track. Sarah missed two workouts. Want me to nudge her?');
      expect(speechRemainder(r.spokenText, r.streamedSay)).toBe('');
    } finally { AI.provider = before; MORE_TOOLS.client_details.run = orig; }
  });

  it('never streams a health detail out loud', async () => {
    const { ask } = await import('../server/assist/AssistService.js');
    const { AI } = await import('../server/ai/AIService.js');
    const fake = { name: 'anthropic', model: 'fake', async chat(req) {
      const text = 'Mike checked in. He said his knee pain is back. The rest looks fine.';
      for (const piece of text.split(/(?<= )/)) req.onText?.(piece);
      return { model: 'fake', usage: {}, json: { stop_reason: 'end_turn', content: [{ type: 'text', text }] } };
    } };
    const before = AI.provider; AI.provider = fake;
    const events = [];
    try {
      const r = await ask(f.dbA, { userId: f.dani.id, businessId: f.A.id }, 'How did Mike’s check-in go?', { voice: true, emit: e => events.push(e) });
      const says = events.filter(e => e.type === 'say').map(e => e.text).join(' ');
      expect(says).toBe('Mike checked in.');
      expect(says).not.toMatch(/knee|pain/);
      expect(r.spokenText).not.toMatch(/knee|pain/);
    } finally { AI.provider = before; }
  });

  it('works over HTTP as server-sent events (offline AI too)', async () => {
    const r = await dani.post('/api/assist/ask/stream', { question: 'Who hasn’t checked in this week?', voice: true });
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toMatch(/text\/event-stream/);
    const events = r.text.split('\n\n').filter(l => l.startsWith('data: ')).map(l => JSON.parse(l.slice(6)));
    const done = events.find(e => e.type === 'done');
    expect(done.answer.speechStreamed).toBe(true);
    expect(done.answer.answerHtml).toBeTruthy();
    // Everything to say arrives as "say" events before "done".
    expect(events.filter(e => e.type === 'say').map(e => e.text).join(' ')).toBe(done.answer.spokenText);
  });

  it('warm-up is a no-op without Claude and needs a login', async () => {
    expect((await dani.post('/api/assist/warm', { lang: 'en' })).body).toEqual({ warmed: false });
  });
});

describe('understanding misheard or mispronounced names', () => {
  it('matches names by sound in English and Spanish', async () => {
    const { soundsLike } = await import('../server/lib/fuzzy.js');
    const people = ['Maya Patel', 'Mike Torres', 'Marcus Reed', 'Jessica Álvarez', 'Yolanda Gómez', 'Ivan Cruz'].map(name => ({ name }));
    const hit = s => soundsLike(people, s).hit?.name || null;
    expect(hit('Mia')).toBe('Maya Patel');
    expect(hit('Marko')).toBe('Marcus Reed');
    expect(hit('jesica alvares')).toBe('Jessica Álvarez');
    expect(hit('Iolanda')).toBe('Yolanda Gómez');
    expect(hit('Mikey')).toBe('Mike Torres');
    expect(hit('Tom')).toBe(null);
    const ex = ['Romanian Deadlift', 'Goblet Squat', 'Lat Pulldown'].map(name => ({ name }));
    expect(soundsLike(ex, 'goblin squat').hit.name).toBe('Goblet Squat');
    expect(soundsLike(ex, 'romanian dedlift').hit.name).toBe('Romanian Deadlift');
  });

  it('Assist tools find the right client when the name was misheard', async () => {
    const { clientByName } = await import('../server/assist/tools.js');
    expect((await clientByName(f.dbA, 'Markus')).client.name).toBe('Marcus Johnson');
    expect((await clientByName(f.dbA, 'Deego')).client.name).toBe('Diego Alvarez');
    expect((await clientByName(f.dbA, 'Elena Garsia')).client.name).toMatch(/^Elena Garc/);
    expect((await clientByName(f.dbA, 'Zebediah')).client).toBe(null);
    // Exact names still win.
    expect((await clientByName(f.dbA, 'Mike')).client.name).toBe('Mike Torres');
  });

  it('the snapshot lists every client by name, not other workspaces’ clients', async () => {
    const { daySnapshot, clearSnapshot } = await import('../server/assist/snapshot.js');
    clearSnapshot();
    const text = await daySnapshot(f.dbA, f.A.id, { tz: 'UTC', now: new Date() });
    expect(text).toMatch(/Marcus Johnson/);
    expect(text).not.toMatch(/Nora Fitzgerald/); // inactive
    expect(text).not.toMatch(/@/); // no emails
    const other = await f.dbB.client.findFirst({ select: { name: true } });
    if (other) expect(text).not.toContain(other.name);
  });
});

describe('speech recognition key terms (Deepgram)', () => {
  it('sends client names and app words as key terms, and retries without them if refused', async () => {
    const { makeVoiceProvider, keytermQuery, keytermsFor } = await import('../server/voice/VoiceService.js');
    expect(keytermQuery(['Maya Patel', 'maya patel', 'x', 'OneJump'])).toBe('&keyterm=Maya%20Patel&keyterm=OneJump');
    const terms = await keytermsFor(f.dbA);
    expect(terms).toContain('Marcus Johnson');
    expect(terms).not.toContain('Nora Fitzgerald');
    const urls = [];
    const dg = makeVoiceProvider('deepgram', { apiKey: 'k', model: 'nova-3', fetchImpl: async url => {
      urls.push(url);
      if (url.includes('keyterm')) return { ok: false, status: 400, text: async () => 'bad keyterm' };
      return { ok: true, status: 200, json: async () => ({ results: { channels: [{ alternatives: [{ transcript: 'how is marcus' }] }] }, metadata: { duration: 1.2 } }) };
    } });
    const r = await dg.transcribe(Buffer.from('x'), { keyterms: ['Marcus Johnson'] });
    expect(r.transcript).toBe('how is marcus');
    expect(urls[0]).toContain('keyterm=Marcus%20Johnson');
    expect(urls[1]).not.toContain('keyterm');
  });
});
