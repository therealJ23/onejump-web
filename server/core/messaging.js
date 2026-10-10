// Threads and messages (one thread per client) plus coach notifications.
export async function ensureThread(db, clientId) {
  const t = await db.thread.findFirst({ where: { clientId } });
  if (t) return t;
  try {
    return await db.thread.create({ data: { clientId } });
  } catch {
    return db.thread.findFirst({ where: { clientId } }); // created concurrently
  }
}

/** Sends a message in a client's thread and updates unread counters. */
export async function sendMessage(db, { clientId, body, senderUserId = null, senderRole = 'COACH', aiInsightId = null, aiEdited = false, audioKey = null, durationS = null, transcriptSummary = null }) {
  const thread = await ensureThread(db, clientId);
  const msg = await db.message.create({ data: { threadId: thread.id, clientId, senderUserId, senderRole, body: String(body).slice(0, 5000), aiInsightId, aiEdited, audioKey, durationS, transcriptSummary } });
  await db.thread.update({
    where: { id: thread.id },
    data: { lastMessageAt: msg.createdAt, ...(senderRole === 'CLIENT' ? { coachUnread: { increment: 1 } } : { clientUnread: { increment: 1 } }) },
  });
  return msg;
}

export async function notify(db, { kind, title, body = null, link = null, dedupeHours = 0 }) {
  if (dedupeHours) {
    const dup = await db.notification.findFirst({ where: { title, createdAt: { gte: new Date(Date.now() - dedupeHours * 3600e3) } }, select: { id: true } });
    if (dup) return dup;
  }
  return db.notification.create({ data: { kind, title: title.slice(0, 190), body: body ? body.slice(0, 190) : null, link } });
}

export async function clientEvent(db, clientId, kind, data = undefined) {
  return db.clientEvent.create({ data: { clientId, kind, data } }).catch(() => null);
}
