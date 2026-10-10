// fetch wrapper for the JSON API: CSRF token, JSON in/out, friendly errors.
let csrf = null;
let onUnauthorized = () => { location.href = '/login'; };
export const setUnauthorizedHandler = fn => { onUnauthorized = fn; };
export const setCsrf = t => { if (t) csrf = t; };

async function refreshCsrf() {
  const r = await fetch('/api/auth/csrf', { credentials: 'same-origin' });
  csrf = (await r.json()).csrfToken;
}

export async function api(method, url, body) {
  if (method !== 'GET' && !csrf) await refreshCsrf();
  const opts = { method, credentials: 'same-origin', headers: { Accept: 'application/json' } };
  if (typeof FormData !== 'undefined' && body instanceof FormData) opts.body = body;
  else if (body !== undefined) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
  if (method !== 'GET') opts.headers['X-CSRF-Token'] = csrf;
  let res;
  try { res = await fetch(url, opts); }
  catch { const e = new Error('You seem to be offline. Check your connection and try again.'); e.offline = true; throw e; }
  if (res.status === 403 && method !== 'GET') {
    const j = await res.clone().json().catch(() => ({}));
    if (j.code === 'csrf') { await refreshCsrf(); opts.headers['X-CSRF-Token'] = csrf; res = await fetch(url, opts); }
  }
  const data = await res.json().catch(() => ({}));
  if (data && data.csrfToken) csrf = data.csrfToken;
  if (!res.ok) {
    const e = new Error(data.error || `Something went wrong (${res.status}).`);
    e.status = res.status; e.data = data;
    if (res.status === 401 && !url.startsWith('/api/auth')) onUnauthorized();
    throw e;
  }
  return data;
}
api.get = url => api('GET', url);
api.post = (url, body = {}) => api('POST', url, body);
api.put = (url, body = {}) => api('PUT', url, body);
api.patch = (url, body = {}) => api('PATCH', url, body);
api.del = (url, body) => api('DELETE', url, body);
api.csrf = () => csrf;
