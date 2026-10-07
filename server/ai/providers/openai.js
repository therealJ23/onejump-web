// OpenAIProvider: chat completions with a JSON-schema response format.
const PRICES = { 'gpt-4o-mini': [0.15, 0.6], 'gpt-4.1-mini': [0.4, 1.6], 'gpt-4o': [2.5, 10] };
const priceFor = model => PRICES[Object.keys(PRICES).find(k => model.startsWith(k))] || [0.4, 1.6];

export class OpenAIProvider {
  constructor({ apiKey, model, fetchImpl = fetch }) {
    if (!apiKey) throw new Error('OPENAI_API_KEY is not set');
    this.name = 'openai'; this.model = model; this.apiKey = apiKey; this.fetch = fetchImpl;
  }
  async complete({ task, system, prompt, schema, maxTokens = 1200 }) {
    const res = await this.fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        max_tokens: maxTokens,
        messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }],
        response_format: { type: 'json_schema', json_schema: { name: `respond_${task}`, schema, strict: false } },
      }),
      signal: AbortSignal.timeout(45000),
    });
    if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const json = await res.json();
    const text = json.choices?.[0]?.message?.content;
    if (!text) throw new Error('OpenAI returned no content');
    const [pin, pout] = priceFor(this.model);
    const inputTokens = json.usage?.prompt_tokens || 0, outputTokens = json.usage?.completion_tokens || 0;
    return { data: JSON.parse(text), model: json.model || this.model, usage: { inputTokens, outputTokens, costMicros: Math.round(inputTokens * pin + outputTokens * pout) } };
  }
}
