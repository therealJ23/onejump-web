// AnthropicProvider: Claude through the Messages API, with the task's JSON schema as a forced tool
// so the answer is always structured. Keys come from server environment variables only.
const PRICES = { // USD per million tokens [input, output]
  'claude-haiku-4-5': [1, 5],
  'claude-sonnet-4-5': [3, 15],
  'claude-sonnet-5-5': [2, 10],
  'claude-opus-5-5': [4, 20],
};
const priceFor = model => PRICES[Object.keys(PRICES).find(k => model.startsWith(k))] || [1, 5];

export class AnthropicProvider {
  constructor({ apiKey, model, fetchImpl = fetch }) {
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set');
    this.name = 'anthropic'; this.model = model; this.apiKey = apiKey; this.fetch = fetchImpl;
  }
  /**
   * One raw Messages API call (used for tool-use conversations like Ask Assist).
   * cache: marks the tools, the system prompt and the conversation so far for prompt caching, so
   * each follow-up step (and the next question within 5 minutes) skips re-reading them: faster
   * and cheaper. Nothing is changed in the caller's arrays.
   */
  async chat({ system, messages, tools = [], maxTokens = 900, model = this.model, cache = false }) {
    const mark = o => ({ ...o, cache_control: { type: 'ephemeral' } });
    let sys = system, tl = tools, msgs = messages;
    if (cache) {
      sys = [mark({ type: 'text', text: String(system) })];
      if (tools.length) tl = [...tools.slice(0, -1), mark(tools.at(-1))];
      const last = messages.at(-1);
      if (last) {
        const content = typeof last.content === 'string' ? [{ type: 'text', text: last.content }] : last.content;
        msgs = [...messages.slice(0, -1), { ...last, content: [...content.slice(0, -1), mark(content.at(-1))] }];
      }
    }
    const body = { model, max_tokens: maxTokens, system: sys, messages: msgs, ...(tl.length ? { tools: tl } : {}) };
    return this.post(body);
  }

  async post(body) {
    let lastErr;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await this.fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'x-api-key': this.apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(45000),
        });
        if (res.status === 429 || res.status >= 500) { lastErr = new Error(`Anthropic ${res.status}`); await new Promise(r => setTimeout(r, 1200 * (attempt + 1))); continue; }
        if (!res.ok) throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 300)}`);
        const json = await res.json();
        const [pin, pout] = priceFor(body.model || this.model);
        const u = json.usage || {};
        const written = u.cache_creation_input_tokens || 0, read = u.cache_read_input_tokens || 0;
        const inputTokens = (u.input_tokens || 0) + written + read, outputTokens = u.output_tokens || 0;
        // Cache writes cost 1.25× input, cache reads 0.1×.
        const costMicros = Math.round((u.input_tokens || 0) * pin + written * pin * 1.25 + read * pin * 0.1 + outputTokens * pout);
        return { json, model: json.model || body.model, usage: { inputTokens, outputTokens, costMicros, cachedTokens: read } };
      } catch (e) { lastErr = e; if (attempt === 1 || !/timeout|fetch failed|ECONN/i.test(String(e))) break; }
    }
    throw lastErr;
  }

  async complete({ task, system, prompt, schema, maxTokens = 1200, description = '', images = [], model = null }) {
    const content = images.length ? [...images.map(i => ({ type: 'image', source: { type: 'base64', media_type: i.mediaType, data: i.base64 } })), { type: 'text', text: prompt }] : prompt;
    const body = {
      model: model || this.model,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content }],
      tools: [{ name: `respond_${task}`, description: description || `Return the ${task} result`, input_schema: schema }],
      tool_choice: { type: 'tool', name: `respond_${task}` },
    };
    let lastErr;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await this.fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'x-api-key': this.apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(45000),
        });
        if (res.status === 429 || res.status >= 500) { lastErr = new Error(`Anthropic ${res.status}`); await new Promise(r => setTimeout(r, 1200 * (attempt + 1))); continue; }
        if (!res.ok) throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 300)}`);
        const json = await res.json();
        const tool = (json.content || []).find(c => c.type === 'tool_use');
        if (!tool) throw new Error('Anthropic returned no structured output');
        const [pin, pout] = priceFor(body.model);
        const inputTokens = json.usage?.input_tokens || 0, outputTokens = json.usage?.output_tokens || 0;
        return { data: tool.input, model: json.model || body.model, usage: { inputTokens, outputTokens, costMicros: Math.round(inputTokens * pin + outputTokens * pout) } };
      } catch (e) { lastErr = e; if (attempt === 1 || !/timeout|fetch failed|ECONN/i.test(String(e))) break; }
    }
    throw lastErr;
  }
}
