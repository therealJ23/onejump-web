// AnthropicProvider: Claude through the Messages API, with the task's JSON schema as a forced tool
// so the answer is always structured. Keys come from server environment variables only.
//
// Speed (Oct 25):
//  - Default model is Claude Haiku 5.5, the fastest and cheapest Claude, with thinking off (it's on
//    by default on that model and only adds waiting for these short jobs). If the account can't
//    use it, the call is retried once on Claude Haiku 4.5 and that model is used from then on.
//  - chat() can stream: pass onText and each piece of the answer is handed over as it's written.
//  - Prompt caching keeps the tools and the fixed system prompt for an hour (cheap to write on
//    Haiku 5.5), and the conversation so far for 5 minutes.
const PRICES = { // USD per million tokens [input, output]
  'claude-haiku-5-5': [0.1, 0.5],
  'claude-haiku-4-5': [1, 5],
  'claude-sonnet-4-5': [3, 15],
  'claude-sonnet-5-5': [2, 10],
  'claude-opus-5-5': [4, 20],
};
const priceFor = model => PRICES[Object.keys(PRICES).find(k => String(model).startsWith(k))] || [1, 5];
export const FALLBACK_MODEL = 'claude-haiku-4-5';
const isHaiku5 = model => /^claude-haiku-5/.test(String(model));

/**
 * Model-specific request options. Haiku 5.x thinks by default (adaptive); for Assist's short,
 * tool-driven answers that's only extra waiting, so thinking is turned off and effort is set.
 */
export function modelOptions(model, { effort = null } = {}) {
  if (!isHaiku5(model)) return {};
  return { thinking: { type: 'disabled' }, ...(effort ? { output_config: { effort } } : {}) };
}

/** Cost in micro-dollars, counting 5-minute (1.25×) and 1-hour (2×) cache writes and cache reads (0.1×). */
export function costOf(model, u = {}) {
  const [pin, pout] = priceFor(model);
  const c = u.cache_creation || {};
  const w1h = c.ephemeral_1h_input_tokens || 0;
  const w5m = c.ephemeral_5m_input_tokens ?? Math.max(0, (u.cache_creation_input_tokens || 0) - w1h);
  const read = u.cache_read_input_tokens || 0, out = u.output_tokens || 0, fresh = u.input_tokens || 0;
  return {
    inputTokens: fresh + w5m + w1h + read, outputTokens: out, cachedTokens: read,
    costMicros: Math.round(fresh * pin + w5m * pin * 1.25 + w1h * pin * 2 + read * pin * 0.1 + out * pout),
  };
}

/** A 400/404 that says the model isn't available to this account (not some other bad request). */
const modelUnavailable = (status, text) => (status === 404 || status === 400) && /model/i.test(text) && /(not[_ ]found|not available|does not exist|invalid model|unknown model|access)/i.test(text);

export class AnthropicProvider {
  constructor({ apiKey, model, fetchImpl = fetch }) {
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set');
    this.name = 'anthropic'; this.model = model; this.apiKey = apiKey; this.fetch = fetchImpl;
    /** Models this account turned out not to have, mapped to the one used instead. */
    this.swapped = new Map();
  }

  /** The model to actually call (after a fallback, the working one). */
  resolve(model) { return this.swapped.get(model) || model; }

  /**
   * One raw Messages API call (used for tool-use conversations like Ask Assist).
   * cache: marks the tools and the fixed system prompt (1 hour) and the conversation so far
   * (5 minutes) for prompt caching, so each follow-up step and the next question skip re-reading
   * them. systemExtra is a second system block after the cached one, for what changes per
   * question (today's date, voice or text, a snapshot of the coach's day).
   * onText(piece): streams the answer as it's written. Nothing is changed in the caller's arrays.
   */
  async chat({ system, systemExtra = '', messages, tools = [], maxTokens = 900, model = this.model, cache = false, effort = null, onText = null }) {
    const mark = (o, ttl) => ({ ...o, cache_control: ttl ? { type: 'ephemeral', ttl } : { type: 'ephemeral' } });
    let sys = systemExtra ? [{ type: 'text', text: String(system) }, { type: 'text', text: String(systemExtra) }] : system, tl = tools, msgs = messages;
    if (cache) {
      sys = [mark({ type: 'text', text: String(system) }, '1h'), ...(systemExtra ? [{ type: 'text', text: String(systemExtra) }] : [])];
      if (tools.length) tl = [...tools.slice(0, -1), mark(tools.at(-1), '1h')];
      const last = messages.at(-1);
      if (last) {
        const content = typeof last.content === 'string' ? [{ type: 'text', text: last.content }] : last.content;
        msgs = [...messages.slice(0, -1), { ...last, content: [...content.slice(0, -1), mark(content.at(-1))] }];
      }
    }
    const build = m => ({ model: m, max_tokens: maxTokens, system: sys, messages: msgs, ...(tl.length ? { tools: tl } : {}), ...modelOptions(m, { effort }), ...(onText ? { stream: true } : {}) });
    return this.withFallback(model, m => (onText ? this.postStream(build(m), onText) : this.post(build(m))));
  }

  /** Runs a call; if the model isn't available to this account, retries once on Haiku 4.5. */
  async withFallback(model, call) {
    const m = this.resolve(model);
    try { return await call(m); }
    catch (e) {
      if (!e.modelUnavailable || m === FALLBACK_MODEL) throw e;
      console.error(`[ai] ${m} isn’t available to this API key; using ${FALLBACK_MODEL} instead.`);
      this.swapped.set(model, FALLBACK_MODEL);
      return call(FALLBACK_MODEL);
    }
  }

  async send(body) {
    return this.fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': this.apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(45000),
    });
  }

  async failure(res) {
    const text = (await res.text().catch(() => '')).slice(0, 300);
    return Object.assign(new Error(`Anthropic ${res.status}: ${text}`), { status: res.status, modelUnavailable: modelUnavailable(res.status, text) });
  }

  async post(body) {
    let lastErr;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await this.send(body);
        if (res.status === 429 || res.status >= 500) { lastErr = new Error(`Anthropic ${res.status}`); await new Promise(r => setTimeout(r, 1200 * (attempt + 1))); continue; }
        if (!res.ok) throw await this.failure(res);
        const json = await res.json();
        return { json, model: json.model || body.model, usage: costOf(body.model || this.model, json.usage) };
      } catch (e) { lastErr = e; if (attempt === 1 || !/timeout|fetch failed|ECONN/i.test(String(e))) break; }
    }
    throw lastErr;
  }

  /**
   * The same call, streamed (server-sent events). Hands each text piece to onText as it arrives
   * and returns the finished message in the same shape as post(). A retry only happens before
   * anything was streamed.
   */
  async postStream(body, onText) {
    let lastErr;
    for (let attempt = 0; attempt < 2; attempt++) {
      let streamed = false;
      try {
        const res = await this.send(body);
        if (res.status === 429 || res.status >= 500) { lastErr = new Error(`Anthropic ${res.status}`); await new Promise(r => setTimeout(r, 1200 * (attempt + 1))); continue; }
        if (!res.ok) throw await this.failure(res);
        const blocks = [], partialJson = [];
        let model = body.model, stopReason = null, usage = {};
        const handle = ev => {
          switch (ev.type) {
            case 'message_start': model = ev.message?.model || model; usage = { ...ev.message?.usage }; break;
            case 'content_block_start': {
              const b = { ...ev.content_block };
              if (b.type === 'text') b.text = b.text || '';
              if (b.type === 'tool_use') { partialJson[ev.index] = ''; b.input = {}; }
              blocks[ev.index] = b;
              break;
            }
            case 'content_block_delta': {
              const b = blocks[ev.index];
              if (!b) break;
              if (ev.delta?.type === 'text_delta') { b.text += ev.delta.text; streamed = true; onText(ev.delta.text, ev.index); }
              else if (ev.delta?.type === 'input_json_delta') partialJson[ev.index] += ev.delta.partial_json || '';
              break;
            }
            case 'content_block_stop': {
              const b = blocks[ev.index];
              if (b?.type === 'tool_use') { try { b.input = partialJson[ev.index] ? JSON.parse(partialJson[ev.index]) : {}; } catch { b.input = {}; } }
              break;
            }
            case 'message_delta': stopReason = ev.delta?.stop_reason ?? stopReason; usage = { ...usage, ...ev.usage }; break;
            case 'error': throw new Error(`Anthropic stream: ${ev.error?.message || 'error'}`);
            default: break;
          }
        };
        await readEvents(res.body, handle);
        const json = { model, stop_reason: stopReason, content: blocks.filter(Boolean), usage };
        return { json, model, usage: costOf(body.model || this.model, usage) };
      } catch (e) { lastErr = e; if (streamed || attempt === 1 || !/timeout|fetch failed|ECONN/i.test(String(e))) break; }
    }
    throw lastErr;
  }

  async complete({ task, system, prompt, schema, maxTokens = 1200, description = '', images = [], model = null }) {
    const content = images.length ? [...images.map(i => ({ type: 'image', source: { type: 'base64', media_type: i.mediaType, data: i.base64 } })), { type: 'text', text: prompt }] : prompt;
    const build = m => ({
      model: m,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content }],
      tools: [{ name: `respond_${task}`, description: description || `Return the ${task} result`, input_schema: schema }],
      tool_choice: { type: 'tool', name: `respond_${task}` },
      ...modelOptions(m),
    });
    return this.withFallback(model || this.model, async m => {
      const r = await this.post(build(m));
      const tool = (r.json.content || []).find(c => c.type === 'tool_use');
      if (!tool) throw new Error('Anthropic returned no structured output');
      return { data: tool.input, model: r.model, usage: r.usage };
    });
  }
}

/** Reads a server-sent events body (a web ReadableStream or a Node stream) and calls handle(event) for each JSON event. */
async function readEvents(body, handle) {
  const decoder = new TextDecoder();
  let buf = '';
  const flush = chunk => {
    buf += chunk;
    let i;
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const raw = buf.slice(0, i); buf = buf.slice(i + 2);
      const data = raw.split('\n').filter(l => l.startsWith('data:')).map(l => l.slice(5).trimStart()).join('\n');
      if (!data || data === '[DONE]') continue;
      let ev; try { ev = JSON.parse(data); } catch { continue; }
      handle(ev);
    }
  };
  if (!body) return;
  if (typeof body.getReader === 'function') {
    const reader = body.getReader();
    for (;;) { const { done, value } = await reader.read(); if (done) break; flush(decoder.decode(value, { stream: true })); }
  } else {
    for await (const chunk of body) flush(typeof chunk === 'string' ? chunk : decoder.decode(chunk, { stream: true }));
  }
  flush(decoder.decode() + '\n\n');
}
