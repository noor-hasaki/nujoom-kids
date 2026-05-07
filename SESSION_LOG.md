# Session Log — Nujoom Kids Platform
**Date:** 2026-05-07  
**Scope:** Bug fixes, AI integration, production deployment, CI/CD setup

---

## 1. Bug Fixes — `parents.html`

### 1.1 Session cards not opening (accordion broken)
**Root cause:** `#view-ai` was placed **outside** the `.content` div (after its closing `</div>` and after the `api.js` script tag). Since `.content` has `position:relative; z-index:2`, it formed a stacking context that intercepted clicks before they reached the session card headers.

**Fix:** Moved `#view-ai` inside `.content`, restored `<script src="api.js">` after `.content` closes.

### 1.2 `viewChild` not defined / Firefox extension conflict
**Root cause:** A Firefox browser extension injected its own `viewChild` function into the page, overriding the app's function and throwing `ReferenceError: getBindingAttr is not defined`.

**Fix:** Renamed `viewChild` → `showKidDetail` in both the function definition and the button `onclick` attribute.

---

## 2. AI Chat "Access Denied" Fix — `dashboard.html`

**Root cause:** The `fetch('/api/ai/chat', ...)` call in `dashboard.html` was missing the `Authorization: Bearer <token>` header. The backend's `authenticate` middleware rejected the request with 401, which the frontend displayed as "Access denied."

**Fix:** Added `Authorization: Bearer ${localStorage.getItem('token')}` to the fetch headers in `dashboard.html`.

Note: `qweenai.html` already had this header correctly — only `dashboard.html` was affected.

---

## 3. AI Provider Migration & Cloudflare Worker Proxy

### 3.1 OpenRouter attempt
Briefly switched from Groq to OpenRouter (`openrouter.ai`). Updated `ai.routes.js` with the OpenRouter endpoint and tested models. Found `google/gemma-4-26b-a4b-it:free` working, but later reverted to Groq (user preference).

### 3.2 Groq blocked in Syria — Cloudflare Worker proxy
`api.groq.com` is unreachable from x-server (Syria network restrictions). Solution per `Task.md`: relay through a Cloudflare Worker on `*.workers.dev`, which is reachable over standard HTTPS.

**Worker code (`nujoom-worker.ebrahym-das.workers.dev`):**
- Accepts `POST` only
- Authenticates via `X-Worker-Key` header checked against `env.WORKER_SECRET`
- Forwards request body to Groq using `env.GROQ_API_KEY`
- Both secrets stored as encrypted Cloudflare Worker environment variables

**Key fix in Worker code:** The original Worker used `export default { async fetch(request) }` — missing the `env` parameter. Groq key was referenced as a bare global (`GROQ_API_KEY`) instead of `env.GROQ_API_KEY`, causing a JS exception (`error code: 1101`). Fixed to `async fetch(request, env)`.

### 3.3 `ai.routes.js` updated for proxy support
```
AI_PROXY_URL  = process.env.AI_PROXY_URL  || 'https://api.groq.com/...'
AI_WORKER_KEY = process.env.AI_WORKER_KEY || ''
```
- When `AI_PROXY_URL` is set: sends `X-Worker-Key` header (no Groq key needed in app)
- When not set: falls back to direct Groq with `Authorization: Bearer`
- Debug logging added to show raw response body on errors

### 3.4 `trust proxy` fix — `app.js`
`express-rate-limit` threw `ERR_ERL_UNEXPECTED_X_FORWARDED_FOR` because nginx sets `X-Forwarded-For` but Express didn't trust it. Added:
```js
app.set('trust proxy', 1);
```

---

## 4. Production Deployment to x-server

### Infrastructure context
- **Server:** HP G62 laptop, Ubuntu 22.04, `192.168.1.108` / `185.225.40.228`
- **Docker network:** `docker_management` / `br-management` (`172.18.0.0/16`)
- **Nginx container:** `172.18.0.100` — receives all public traffic via DNAT
- **No new DNAT rules needed:** nujoom on same Docker network, nginx proxies directly

### 4.1 Production secrets generated
```
JWT_SECRET            = 74e0fc1e...  (64 bytes)
INTERNAL_ADMIN_API_KEY = b4ea07f2...  (32 bytes)
AI_WORKER_KEY          = 102ed3ae...  (32 bytes)
```

### 4.2 Files created
- `kids-platform/Dockerfile` — build context is `~/docker/nujoom/`, copies `app/backend-node/` and `app/frontend/`
- `kids-platform/.dockerignore` — excludes `node_modules`, `.env`, `database.db`, `.git`
- `kids-platform/backend-node/.env.production` — production env (not committed to git)

### 4.3 Rsync to x-server
```bash
rsync -avz --exclude 'node_modules' --exclude '.env' --exclude 'database.db' \
  kids-platform/ x-server:~/docker/nujoom/app/
rsync -avz frontend/ x-server:~/docker/nujoom/app/frontend/
```

### 4.4 Docker image build
`npm ci` has a known silent failure bug with BuildKit on this npm version. Also, BuildKit doesn't support named networks. Solution:
```bash
DOCKER_BUILDKIT=0 docker build --network docker_management -t nujoom:latest .
```
The `--network docker_management` flag is required because only `br-management` has outbound NAT rules in `/etc/ufw/before.rules`.

`npm install` (93 packages) succeeded cleanly.

### 4.5 `docker-compose.yml` updated
Added to `~/docker/docker-compose.yml`:
```yaml
nujoom:
  image: nujoom:latest
  container_name: nujoom
  restart: unless-stopped
  env_file:
    - ./nujoom/app/backend-node/.env
  volumes:
    - nujoom-data:/data
  networks:
    management:
      ipv4_address: 172.18.0.90

volumes:
  nujoom-data:
```
Container IP `172.18.0.90` chosen (unused, away from nginx at `.100` and ntfy at `.83`).

### 4.6 SSL certificate
Temporary HTTP server block added to nginx for ACME challenge, then:
```bash
docker run --rm --network docker_management \
  -v ~/docker/certbot/conf:/etc/letsencrypt \
  -v ~/docker/certbot/www:/var/www/certbot \
  certbot/certbot certonly --webroot -w /var/www/certbot \
  -d nujoom-kids.duckdns.org \
  --email ebrahym.das@gmail.com --agree-tos --no-eff-email
```
Certificate issued. Expires 2026-08-05. Auto-renews via existing Sunday 3 AM cron.

### 4.7 Nginx HTTPS server block
Added to `~/docker/nginx.conf` — reverse proxy to `172.18.0.90:3000` with full security headers (HSTS, X-Frame-Options, CSP from Helmet, rate limiting using existing `global` zone).

**Issues fixed during nginx config:**
- `listen 443 ssl http2` → `listen 443 ssl` (deprecated directive in this nginx version)
- `include /etc/nginx/conf.d/banned-ips.conf` → `include /etc/nginx/banned-ips.conf` (correct path)
- Rate limit zone name `general` → `global` (must match the zone defined at line 50)
- `sed -i` swaps file inodes — Docker bind mounts lose the file. Fixed by using `cat > file` to write in-place, then `docker compose up -d --force-recreate nginx` to remount

### 4.8 Backup script updated
Added to `~/scripts/backup.sh`:
```bash
cp "$HOME_DIR/docker/nujoom/app/backend-node/.env" "$STAGING/nujoom-env"
docker cp nujoom:/data/database.db "$STAGING/nujoom-database.db"
```

---

## 5. CI/CD — GitHub Actions + Self-Hosted Runner

### 5.1 Repository
`https://github.com/noor-hasaki/nujoom-kids`

### 5.2 Workflow (`.github/workflows/deploy.yml`)
Triggers on push to `main`:
1. Checkout code
2. `rsync` to `~/docker/nujoom/app/`
3. `DOCKER_BUILDKIT=0 docker build --network docker_management`
4. `docker compose up -d nujoom`
5. Health check: `curl http://172.18.0.90:3000/health`

### 5.3 Self-hosted runner on x-server
GitHub CDN (`objects.githubusercontent.com`) is blocked in Syria. Downloaded runner on laptop, SCP'd to x-server:
```bash
# On laptop:
curl -fL -o actions-runner-linux-x64.tar.gz \
  https://github.com/actions/runner/releases/download/v2.334.0/actions-runner-linux-x64-2.334.0.tar.gz
scp actions-runner-linux-x64.tar.gz x-server:~/actions-runner/

# On x-server:
cd ~/actions-runner
tar xzf actions-runner-linux-x64.tar.gz
./config.sh --url https://github.com/noor-hasaki/nujoom-kids \
  --name x-server --labels self-hosted,linux --unattended
sudo ./svc.sh install ibrah5em
sudo ./svc.sh start
```
Runner runs as a systemd service, polls GitHub over outbound HTTPS — no inbound port needed.

### 5.4 Node.js deprecation warning suppressed
Added `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: true` env var to the checkout step to opt into Node.js 24 ahead of the June 2026 forced migration.

---

## 6. Git History Cleanup

`.claude/settings.local.json` and `x-server-docs.md` were accidentally committed and pushed (contain server infrastructure details and Claude Code settings).

**Purged from entire history using `git-filter-repo`:**
```bash
pip3 install git-filter-repo
git filter-repo \
  --path .claude/settings.local.json --invert-paths \
  --path x-server-docs.md --invert-paths \
  --force
git remote add origin https://github.com/noor-hasaki/nujoom-kids.git
git push origin main --force
```
Both files removed from all 5 commits. Force-pushed rewritten history to GitHub.

`x-server-docs.md` and `.claude/` added to `.gitignore` to prevent re-commitment.

---

## Summary

| Item | Status |
|------|--------|
| `parents.html` accordion fix | ✅ |
| `dashboard.html` auth header fix | ✅ |
| Cloudflare Worker AI proxy | ✅ |
| `trust proxy` / rate-limit fix | ✅ |
| Docker image builds on x-server | ✅ |
| Container running at `172.18.0.90` | ✅ |
| SSL cert `nujoom-kids.duckdns.org` | ✅ |
| Nginx HTTPS reverse proxy | ✅ |
| Backup script updated | ✅ |
| GitHub Actions CI/CD pipeline | ✅ |
| Self-hosted runner on x-server | ✅ |
| Sensitive files purged from git history | ✅ |

**Live at:** `https://nujoom-kids.duckdns.org`  
**Repository:** `https://github.com/noor-hasaki/nujoom-kids`
