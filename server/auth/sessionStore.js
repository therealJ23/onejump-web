// express-session store backed by MySQL (the UserSession table) through Prisma.
import session from 'express-session';
import { sessions } from '../db/system.js';

export class MySqlSessionStore extends session.Store {
  constructor({ ttlMs = 14 * 864e5 } = {}) {
    super();
    this.ttlMs = ttlMs;
    this.pruneTimer = setInterval(() => sessions.prune().catch(() => {}), 60 * 60e3);
    this.pruneTimer.unref?.();
  }
  expiry(sess) {
    const exp = sess?.cookie?.expires ? new Date(sess.cookie.expires) : new Date(Date.now() + this.ttlMs);
    return exp;
  }
  get(sid, cb) {
    sessions.get(sid).then(row => {
      if (!row || row.expiresAt < new Date()) return cb(null, null);
      cb(null, JSON.parse(row.data));
    }, cb);
  }
  set(sid, sess, cb) {
    sessions.set(sid, JSON.stringify(sess), this.expiry(sess)).then(() => cb?.(null), e => cb?.(e));
  }
  touch(sid, sess, cb) {
    sessions.touch(sid, this.expiry(sess)).then(() => cb?.(null), e => cb?.(e));
  }
  destroy(sid, cb) {
    sessions.destroy(sid).then(() => cb?.(null), e => cb?.(e));
  }
  close() { clearInterval(this.pruneTimer); }
}
