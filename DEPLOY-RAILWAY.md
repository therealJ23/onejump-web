# Going live on Railway at onejumpfit.com

OneJump runs on the Railway project you already use for the old website, with its own database
(`onejump`) on the same MySQL server, so the old site's data is never touched.

Railway reads `railway.json`: it installs, runs the database migrations before every deploy
(`npm run db:migrate`, which also creates the `onejump` database the first time), then starts the
server and checks `/api/health`.

## 1. Code on GitHub
1. Go to **github.com/new** → name `onejump-app` → **Private** → leave everything unticked → **Create repository**.
2. Send Claude the name (`your-username/onejump-app`). Claude pushes the code.

## 2. Add the app to your Railway project
1. Open **railway.com** → your OneJump project (the one with the website and MySQL).
2. **+ Create** (or **+ New**) → **GitHub Repo** → pick `onejump-app`. If it isn't listed, click **Configure GitHub App** and give Railway access to that repo.
3. Click the new service → **Variables** → **Raw Editor** → paste the block Claude gave you (or this, with your own secret):
   ```
   NODE_ENV=production
   APP_URL=https://onejumpfit.com
   MYSQL_URL=${{MySQL.MYSQL_URL}}
   DATABASE_NAME=onejump
   SESSION_SECRET=<48+ random characters>
   JOBS_ENABLED=true
   ```
   `MySQL` must match the name of your MySQL service in Railway (check its name on the project canvas).
   → **Update Variables**.
4. **Volume** (keeps progress photos, food photos and voice notes across deploys): right-click the service on the canvas (or ⌘K) → **Attach volume** → mount path `/data` → **Attach**.
5. The service deploys. Open **Deployments** → the latest one → **View logs**. You should see
   `[migrate] created database onejump`, then `OneJump running at https://onejumpfit.com`.
6. **Settings → Networking → Generate Domain** gives a test address (`…up.railway.app`). Open it and check the landing page loads.

## 3. Move onejumpfit.com to the app
1. Old website service → **Settings → Networking** → next to `onejumpfit.com` (and `www`) click the trash icon. The old site stays online at its own `…up.railway.app` address.
2. New `onejump-app` service → **Settings → Networking → + Custom Domain** → `onejumpfit.com` → Railway shows a **CNAME** value. Do the same for `www.onejumpfit.com`.
3. **dash.cloudflare.com** → onejumpfit.com → **DNS → Records** → edit the existing `onejumpfit.com` (and `www`) CNAME records → paste Railway's new value → **Save**. Leave Zoho's MX/TXT email records alone.
4. Wait for Railway to show a green check next to the domain (a few minutes), then open https://onejumpfit.com.

## 4. Your own account
1. Go to **https://onejumpfit.com/signup** and create your coach account.
2. For the OneJump admin page: Railway service → **⋯ → Run command** (or ask Claude) → `npm run admin:grant -- your@email.com` → then open **/admin**.

## Before inviting real clients
- **Resend** (PROGRESS.md → step 4): clients log in with an emailed link, so email must work first.
- Optional, any time: Anthropic key (real Assist), USDA key (food search), Deepgram key (voice), Stripe (coach plans and client payments). Until then the app runs on its built-in stand-ins.
