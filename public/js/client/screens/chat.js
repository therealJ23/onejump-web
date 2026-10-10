// Client: messages with the coach (prototype cChat).
import { api } from '../../shared/api.js';
import { micButton } from '../../shared/dictation.js';
import { esc, fmtTime, fmtDate, daysAgo } from '../../shared/format.js';
import { icon } from '../../shared/icons.js';
import { toast, toastError } from '../../shared/ui.js';
import { voiceNoteButton, voiceNoteBody, recordVoiceNote } from '../../shared/voiceNote.js';
import { brandRow } from './today.js';

const dayLabel = v => { const n = daysAgo(v); return n === 0 ? 'Today' : n === 1 ? 'Yesterday' : fmtDate(v); };
function bubbles(list) {
  let last = '';
  return list.map(m => { const d = dayLabel(m.at), sep = d !== last ? `<div class="day-sep">${d}</div>` : ''; last = d; return `${sep}<div class="bubble ${m.from === 'me' ? 'me' : 'them'}${m.voice ? ' voice' : ''}">${m.voice ? voiceNoteBody(m, `/api/me/messages/${m.id}/audio`) : esc(m.body)}<span class="time">${fmtTime(m.at)}${m.voice ? ' · voice note' : ''}</span></div>`; }).join('');
}
let poll = null;

export default {
  tab: 'chat',
  title: () => 'Messages',
  load: () => api.get('/api/me/thread'),
  render(d) {
    return `<div class="row between" style="padding-top:4px">${brandRow()}<span class="strong">Your coach</span></div>
    <div class="stack s8" id="msgs" aria-live="polite">${d.messages.length ? bubbles(d.messages) : `<div class="empty">${icon('message')}<div class="h3" style="color:var(--ink)">Say hi</div><p>Questions about a workout, how you’re feeling, anything. Your coach usually replies within a day.</p></div>`}</div>
    <form class="row cchat" data-form="send"><label class="grow"><span class="sr">Message your coach</span><input class="input" id="cchat-in" name="body" placeholder="Message your coach" autocomplete="off" maxlength="3000" style="border-radius:999px"></label>${micButton('cchat-in')}${d.features?.voiceNotes ? voiceNoteButton() : ''}<button class="btn primary icon" type="submit" aria-label="Send">${icon('send')}</button></form>
    ${d.features?.voiceNotes ? '<p class="tiny faint" style="text-align:center;margin:0">Voice notes: your coach gets the audio and a written transcript.</p>' : ''}`;
  },
  mount(root, _d, _p, ctx) {
    window.scrollTo(0, document.body.scrollHeight);
    root.querySelector('[data-voice-note]')?.addEventListener('click', () => {
      const form = root.querySelector('form.cchat');
      recordVoiceNote(form, {
        provider: ctx.data.features?.voiceProvider,
        send: fd => api.post('/api/me/voice-notes', fd),
        onSent: r => { ctx.data.messages.push(r.message); const list = document.getElementById('msgs'); if (list) list.innerHTML = bubbles(ctx.data.messages); window.scrollTo(0, document.body.scrollHeight); toast('Voice note sent. Your coach gets the audio plus a transcript.'); },
      });
    });
    clearInterval(poll);
    poll = setInterval(async () => {
      if (!document.getElementById('msgs')) { clearInterval(poll); return; }
      if (document.hidden) return;
      try { const r = await api.get('/api/me/thread'); if (r.messages.length !== ctx.data.messages.length) { ctx.data = r; document.getElementById('msgs').innerHTML = bubbles(r.messages); window.scrollTo(0, document.body.scrollHeight); } } catch { /* offline: try next time */ }
    }, 20000);
  },
  forms: {
    async send(form, _e, ctx) {
      const input = form.body, body = input.value.trim(); if (!body) return input.focus();
      const btn = form.querySelector('[type=submit]'); btn.disabled = true;
      try {
        const r = await api.post('/api/me/messages', { body });
        ctx.data.messages.push(r.message); input.value = '';
        document.getElementById('msgs').innerHTML = bubbles(ctx.data.messages);
        window.scrollTo(0, document.body.scrollHeight);
      } catch (e) { toastError(e); }
      btn.disabled = false; input.focus();
    },
  },
};
