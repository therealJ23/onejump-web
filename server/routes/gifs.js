// GIF search for chat (coach and client), through GIPHY. The key stays on the server; results are
// rated PG and come back in the shape the apps draw. Without GIPHY_API_KEY: { available: false }.
// GIPHY's terms ask for "Powered by GIPHY" wherever the results show; the apps show it.
import { Router } from 'express';
import { config } from '../config.js';

export const router = Router();
const cache = new Map(); // query → { at, items } for 10 minutes (keeps the beta key's hourly limit)

async function giphy(path, params) {
  const key = `${path}?${new URLSearchParams(params)}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 10 * 60e3) return hit.items;
  const r = await fetch(`https://api.giphy.com/v1/gifs/${path}?${new URLSearchParams({ api_key: config.giphyKey, rating: 'pg', limit: '24', bundle: 'messaging_non_clips', ...params })}`, { signal: AbortSignal.timeout(6000) });
  if (!r.ok) throw new Error(`GIPHY ${r.status}`);
  const j = await r.json();
  const items = (j.data || []).map(g => {
    const full = g.images?.downsized_medium || g.images?.downsized || g.images?.original;
    const small = g.images?.fixed_width_downsampled || g.images?.fixed_width || full;
    return { id: g.id, title: g.title || '', url: full?.url, previewUrl: small?.url || full?.url, width: Number(full?.width) || null, height: Number(full?.height) || null };
  }).filter(g => g.url);
  cache.set(key, { at: Date.now(), items });
  if (cache.size > 300) cache.delete(cache.keys().next().value);
  return items;
}

router.get('/', async (req, res) => {
  if (!config.giphyKey) return res.json({ available: false, items: [] });
  const q = String(req.query.q || '').trim().slice(0, 50);
  const lang = req.query.lang === 'es' ? 'es' : 'en';
  try {
    const items = q ? await giphy('search', { q, lang }) : await giphy('trending', {});
    res.json({ available: true, items, attribution: 'Powered by GIPHY' });
  } catch (e) {
    console.error('[gifs]', e.message);
    res.json({ available: true, items: [], error: 'GIFs aren’t loading right now.' });
  }
});
