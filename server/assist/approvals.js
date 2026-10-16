// Hands-free approvals. While the coach is talking to Assist, a proposal is read back out loud
// ("Here's what I'd send Maria: … Should I send it?") and the next thing the coach says can approve
// or cancel it. Only a short, clear yes or no counts; anything else ("yes, but change the last
// line") goes to Assist as a normal question and the proposal stays on screen.
// Proposals with health details are never read aloud, so they can't be approved by voice.
import { confirmProposal, cancelProposal, speakableText } from './proposals.js';

const first = n => String(n || '').split(' ')[0];
const FILLER = /^(?:(?:um+|uh+|uhm|erm|hmm+|ah|oh|well|so|okay so|ok so|eh|este|pues|bueno|mmm+)[\s,.!]+)+/i;
const YES = /^(?:yes|yeah|yea|yep|yup|ya|sure|of course|ok|okay|alright|all right|do it|go ahead|go for it|send(?: it)?|send that|save(?: it)?|confirm(?: it)?|confirmed|approve(?: it)?|approved|sounds good|looks good|perfect|great|correct|right|please|please do|yes please|absolutely|definitely|let'?s do it|that'?s (?:good|fine|great|perfect|right)|s[ií]|claro|dale|vale|de acuerdo|perfecto|correcto|env[ií]a(?:lo|la)?|m[aá]nda(?:lo|la)?|gu[aá]rda(?:lo|la)?|hazlo|confirma(?:do|lo)?|est[aá] bien|por favor|ok[aá]y)(?=$|[\s,.!;:])/i;
const NO = /^(?:no|nope|nah|not now|not yet|cancel(?: it| that)?|don'?t|do not|stop|never ?mind|forget it|scratch that|no thanks|no thank you|cancela(?:lo)?|no lo (?:env[ií]es|mandes|guardes|hagas)|d[eé]ja(?:lo)?|olv[ií]da(?:lo)?|todav[ií]a no|ahora no)(?=$|[\s,.!;:])/i;
const HEDGE = /\b(?:but|change|instead|except|actually|edit|rewrite|add|remove|make it|wait|hold on|hang on|pero|cambia|en vez|excepto|agrega|quita|espera)\b/i;
const QUESTION = /\?|¿|\b(?:what|who|how|why|when|where|which)\b|(?:^|\s)(?:qué|quién|cómo|cuándo|dónde|cuál)(?=$|[\s,.!])/i;

/** 'yes' | 'no' | null for a short spoken or typed reply. */
export function yesNo(text) {
  const t = String(text || '').trim().replace(/[“”"]/g, '').replace(FILLER, '').trim();
  if (!t || t.split(/\s+/).length > 8 || HEDGE.test(t) || QUESTION.test(t)) return null;
  if (NO.test(t)) return 'no';
  if (YES.test(t)) return 'yes';
  return null;
}

const clip = (s, max = 420) => {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  if (t.length > max) return `${t.slice(0, max).replace(/\s+\S*$/, '')}… The rest is on screen.`;
  return /[.!?…”"')]$/.test(t) ? t : `${t}.`; // a full stop before "Should I send it?"
};

/** What Assist says out loud when it creates a proposal: the content, then a yes-or-no question. */
export function readBack(p, lang = 'en') {
  const d = p.payload || {}, es = lang === 'es', f = first(d.clientName || d.name);
  const onScreen = es ? `${f ? `Lo de ${f}` : 'Eso'} menciona temas de salud, así que está en pantalla. Léelo y toca confirmar.` : `It mentions health details, so it’s on screen. Read it and tap confirm.`;
  switch (p.type) {
    case 'send_message':
      return speakableText(d.text) ? (es ? `Esto es lo que le enviaría a ${f}: ${clip(d.text)} ¿Lo envío?` : `Here’s what I’d send ${f}: ${clip(d.text)} Should I send it?`) : onScreen;
    case 'reply_checkin':
      return d.voiceOk && speakableText(d.text) ? (es ? `Esta es la respuesta al check-in de ${f}: ${clip(d.text)} ¿La envío?` : `Here’s my reply to ${f}’s check-in: ${clip(d.text)} Should I send it?`) : onScreen;
    case 'add_note':
      return speakableText(d.text) ? (es ? `Voy a guardar esta nota en el perfil de ${f}: ${clip(d.text, 300)} ¿La guardo?` : `I’ll save this note on ${f}’s profile: ${clip(d.text, 300)} Should I save it?`) : onScreen;
    case 'create_lead':
      return es ? `Tengo un nuevo prospecto: ${d.name}${d.goal ? `, que quiere ${d.goal}` : ''}. ¿Lo agrego?` : `New lead: ${d.name}${d.goal ? `, who wants ${d.goal}` : ''}. Should I add them?`;
    case 'send_reminders': {
      const names = d.recipients.slice(0, 4).map(first);
      const more = d.recipients.length - names.length;
      const list = es ? `${names.join(', ')}${more > 0 ? ` y ${more} más` : ''}` : `${names.join(', ')}${more > 0 ? ` and ${more} more` : ''}`;
      return es ? `${d.recipients.length} clientes no han hecho su check-in: ${list}. ¿Les envío el recordatorio?` : `${d.recipients.length} client${d.recipients.length === 1 ? '' : 's'} haven’t checked in: ${list}. Should I send the reminder?`;
    }
    case 'assign_program':
      return es ? `Voy a empezar a ${f} en ${d.programName}${d.startDate ? ` el ${d.startDate}` : ' el próximo lunes'}. ¿Lo hago?` : `I’ll start ${f} on ${d.programName}${d.startDate ? ` on ${d.startDate}` : ' next Monday'}. Should I do it?`;
    case 'nutrition_plan':
      if (!d.voiceOk) return es ? `Hice un plan general para ${f}, pero sus notas mencionan un tema médico, así que un dietista debería guiarlo. Está en pantalla.` : `I drafted a general plan for ${f}, but their notes mention a medical topic, so a dietitian should guide it. It’s on screen.`;
      return es ? `${d.line} ¿Lo guardo en el plan de ${f}?` : `${d.line} Should I save it to ${f}’s plan?`;
    default:
      return es ? 'Está en pantalla. ¿Lo hago?' : 'It’s on screen. Should I do it?';
  }
}
/** Can the coach answer this proposal out loud? */
export const voiceApprovable = p => p.payload?.voiceOk !== false && !/health details/.test(readBack(p));

/**
 * If `text` is a clear yes/no to the pending proposal, approves or cancels it and returns the answer.
 * Returns null when it isn't a decision (the caller then asks Assist as usual).
 */
export async function decidePending(db, auth, pendingId, text, { lang = 'en', via = 'voice' } = {}) {
  if (!pendingId) return null;
  const answer = yesNo(text);
  if (!answer) return null;
  const p = await db.assistProposal.findFirst({ where: { id: pendingId } });
  if (!p || p.userId !== auth.userId) return null;
  const es = lang === 'es';
  const reply = (msg, extra = {}) => ({ answerHtml: `<p>${msg.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])}</p>`, answerText: msg, spokenText: msg, proposals: [], trace: [], followups: [], ...extra });
  try {
    if (answer === 'yes') {
      const r = await confirmProposal(db, auth, p.id, { via });
      const msg = es ? `Listo. ${r.message ? translateDone(r.message) : ''}`.trim() : `Done. ${r.message || ''}`.trim();
      return reply(msg, { decided: { id: p.id, confirmed: true, message: r.message } });
    }
    const r = await cancelProposal(db, auth, p.id);
    const msg = es ? 'Está bien, no lo haré.' : 'Okay, I won’t do that.';
    return reply(msg, { decided: { id: p.id, confirmed: false, message: r.message } });
  } catch (e) {
    return reply(String(e.message || 'That didn’t work.'), { decided: { id: p.id, confirmed: false, message: String(e.message || '') } });
  }
}

/** The confirmation messages are English sentences from proposals.js; say the common ones in Spanish. */
function translateDone(m) {
  return m
    .replace(/^Sent to (.+)\.$/, 'Enviado a $1.')
    .replace(/^Replied to (.+)’s check-in\.$/, 'Le respondí el check-in a $1.')
    .replace(/^Note saved to (.+)’s profile\.$/, 'Nota guardada en el perfil de $1.')
    .replace(/^(.+) is in your new leads\.$/, '$1 está en tus nuevos prospectos.')
    .replace(/^Sent (\d+) reminders?\.$/, 'Envié $1 recordatorio(s).')
    .replace(/^(.+) is on (.+)\.$/, '$1 ya está en $2.')
    .replace(/^(.+)’s nutrition plan is saved\.$/, 'El plan de nutrición de $1 está guardado.');
}
