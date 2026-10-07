// zod validation for every request body (and query strings where they matter).
import { z } from 'zod';
import { badRequest } from './errors.js';

export { z };

function format(err) {
  const fields = {};
  for (const issue of err.issues) {
    const key = issue.path.join('.') || '_';
    if (!fields[key]) fields[key] = issue.message;
  }
  return fields;
}

/** Validates req.body; on success replaces it with the parsed (stripped, coerced) value. */
export function body(schema) {
  return (req, _res, next) => {
    const r = schema.safeParse(req.body ?? {});
    if (!r.success) return next(badRequest('Some details need fixing.', { fields: format(r.error) }));
    req.body = r.data;
    next();
  };
}

/** Validates req.query into req.q (Express 5 makes req.query read-only). */
export function query(schema) {
  return (req, _res, next) => {
    const r = schema.safeParse(req.query ?? {});
    if (!r.success) return next(badRequest('Invalid query.', { fields: format(r.error) }));
    req.q = r.data;
    next();
  };
}

// Shared field rules
export const id = z.string().min(1).max(64);
export const email = z.string().trim().toLowerCase().max(190).pipe(z.email({ message: 'Enter a valid email address.' }));
export const name = z.string().trim().min(1, 'Required').max(120);
export const shortText = z.string().trim().max(190);
export const longText = z.string().trim().max(5000);
export const password = z.string().min(10, 'Use at least 10 characters.').max(200);
export const score10 = z.coerce.number().int().min(1).max(10);
export const empty = z.object({}).strip();
