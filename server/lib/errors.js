export class HttpError extends Error {
  /** @param {number} status @param {string} message @param {Record<string, any>} [extra] */
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}
export const badRequest = (msg = 'Check the highlighted fields and try again.', extra) => new HttpError(400, msg, extra);
export const unauthorized = (msg = 'Please log in.') => new HttpError(401, msg);
export const forbidden = (msg = 'You don’t have access to that.') => new HttpError(403, msg);
export const notFound = (msg = 'Not found.') => new HttpError(404, msg);
export const conflict = (msg) => new HttpError(409, msg);
export const paymentRequired = (msg, extra) => new HttpError(402, msg, extra);

/** Throws 404 when a tenant lookup comes back empty (another business's id looks exactly like a missing one). */
export function must(value, what = 'That item') {
  if (value == null) throw notFound(`${what} wasn’t found in your workspace.`);
  return value;
}
