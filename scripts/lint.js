// Build-time rules that keep the architecture honest (run by `npm test`):
//  1. Only server/db/* may import the raw Prisma client (tenant isolation lives there).
//  2. No front-end framework or TypeScript in public/.
//  3. No secrets hard-coded in source.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const problems = [];
function walk(dir, out = []) {
  for (const f of readdirSync(dir)) {
    if (['node_modules', 'generated', '.git', 'var'].includes(f)) continue;
    const p = path.join(dir, f);
    if (statSync(p).isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
}
const rel = p => path.relative(root, p);
for (const file of walk(path.join(root, 'server')).filter(f => f.endsWith('.js'))) {
  const src = readFileSync(file, 'utf8');
  const inDb = rel(file).startsWith(path.join('server', 'db'));
  if (!inDb && /from\s+['"][./]*(db\/prisma(\.js)?|.*generated\/prisma[^'"]*)['"]/.test(src)) problems.push(`${rel(file)}: imports the raw Prisma client. Use dbFor(session) from server/db/tenant.js.`);
  if (!inDb && /new PrismaClient\(/.test(src)) problems.push(`${rel(file)}: creates a PrismaClient outside server/db.`);
}
for (const file of walk(path.join(root, 'public'))) {
  if (/\.(tsx?|jsx)$/.test(file)) problems.push(`${rel(file)}: TypeScript/JSX files aren't allowed in public/.`);
  if (file.endsWith('.js') || file.endsWith('.html')) {
    const src = readFileSync(file, 'utf8');
    if (/from\s+['"](react|vue|svelte|preact|@angular)/.test(src)) problems.push(`${rel(file)}: front-end frameworks aren't allowed.`);
    if (/\son[a-z]+\s*=\s*["']/i.test(src) && file.endsWith('.html')) problems.push(`${rel(file)}: inline event handlers break the Content Security Policy; use data-act + event delegation.`);
  }
}
for (const file of [...walk(path.join(root, 'server')), ...walk(path.join(root, 'public'))].filter(f => /\.(js|html)$/.test(f))) {
  const src = readFileSync(file, 'utf8');
  if (/sk_live_[0-9a-zA-Z]{10,}|sk-ant-[0-9a-zA-Z-]{20,}|re_[0-9a-zA-Z]{20,}/.test(src)) problems.push(`${rel(file)}: looks like a hard-coded secret key.`);
}
if (problems.length) { console.error('Lint failed:\n- ' + problems.join('\n- ')); process.exit(1); }
console.log('Lint passed.');
