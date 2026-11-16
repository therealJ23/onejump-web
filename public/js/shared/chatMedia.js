// Photos, videos, GIFs and reactions in a chat bubble (coach inbox and client chat, web).
import { esc } from './format.js';

/** The media part of a bubble. Links are short-lived (signed), so they come fresh with each thread load. */
export function mediaHtml(list = []) {
  return (list || []).map(a => {
    const ratio = a.width && a.height ? ` style="aspect-ratio:${a.width}/${a.height}"` : '';
    if (a.kind === 'video') return `<video class="chat-media" src="${esc(a.url)}" controls playsinline preload="metadata"${ratio}></video>`;
    if (a.kind === 'gif') return `<img class="chat-media" src="${esc(a.url)}" alt="${esc(a.title || 'GIF')}" loading="lazy"${ratio}><span class="tiny faint">GIF · via GIPHY</span>`;
    return `<a href="${esc(a.url)}" target="_blank" rel="noopener"><img class="chat-media" src="${esc(a.url)}" alt="Photo" loading="lazy"${ratio}></a>`;
  }).join('');
}

export const reactionsHtml = (list = []) => (list?.length ? `<span class="chat-reacts">${list.map(r => `<span class="chat-react${r.mine ? ' mine' : ''}" title="${r.mine ? 'You reacted' : ''}">${esc(r.emoji)}${r.count > 1 ? ` ${r.count}` : ''}</span>`).join('')}</span>` : '');

/** A paperclip that sends a photo or video. send(FormData) → { message }. */
export function attachButton() {
  return `<label class="btn icon ghost" title="Send a photo or video" style="cursor:pointer"><span class="sr">Send a photo or video</span><input type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime" data-attach hidden>📎</label>`;
}
export function wireAttach(root, { send, onSent, onError }) {
  root.querySelector('[data-attach]')?.addEventListener('change', async e => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 60 * 1024 * 1024) return onError?.(new Error('That file is too big (60 MB max).'));
    const fd = new FormData();
    fd.append('media', file);
    try { onSent(await send(fd)); } catch (err) { onError?.(err); }
  });
}
