# Deployment: Oracle Cloud VM behind AWS CloudFront

The app runs on an **Oracle Cloud Always Free** Arm VM and is served worldwide through
**AWS CloudFront** edge locations. Infrastructure is defined in Terraform, and every push to
`main` is tested and deployed by GitHub Actions.

## Architecture

```
                 ┌──────────────────────────────────────────────────────────┐
  Users ──HTTPS──► AWS CloudFront  (600+ edge locations, PriceClass_All)    │
  (anywhere)     │  • TLS termination + HTTP/3 at the nearest edge          │
                 │  • CloudFront Function (viewer-request): blocks scanner  │
                 │    paths (/.env, /.git, *.php …) before the origin       │
                 │  • /_next/static/*  → cached at edge (immutable assets)  │
                 │  • /api/*, pages    → not cached, cookies forwarded       │
                 │  • Security headers + Server-Timing added at the edge    │
                 │  • Shield Standard DDoS protection (automatic)           │
                 └───────────────┬──────────────────────────────────────────┘
                                 │ HTTPS + X-Origin-Verify: <secret>
                                 ▼
  Oracle Cloud Always Free — Ampere A1 VM (arm64, Ubuntu)   yourapp.duckdns.org
  ┌─────────────────────────────────────────────────────────────────────────┐
  │ docker compose (project: resume-portal)                                 │
  │  caddy :80/:443 ── Let's Encrypt cert, 403 unless X-Origin-Verify OK    │
  │     └─► frontend :3000 (Next.js, NextAuth, SQLite)   [internal only]    │
  │            └─► backend :8000 (FastAPI, LangChain, Chroma) [internal]    │
  │  volumes: web-data, vector-data, caddy-data  → nightly backup.sh        │
  └─────────────────────────────────────────────────────────────────────────┘

  GitHub Actions: typecheck/build → backend import → terraform validate → docker build
                  → (main) SSH deploy to VM → smoke test through CloudFront
```

### Design decisions

| Decision | Why |
|---|---|
| VM instead of serverless | The app keeps state on disk (SQLite, PDFs, Chroma), so it needs a persistent disk, and the ML dependencies need more than 1 GB of RAM. Oracle's free A1 VM provides both. |
| DuckDNS hostname for the origin | CloudFront origins must be DNS names, not IPs. A hostname also lets Caddy get a real TLS certificate, so the CloudFront→origin hop is encrypted. |
| `X-Origin-Verify` secret header | Prevents bypassing the edge by hitting the VM directly. CloudFront adds the header; Caddy returns 403 without it. |
| Cache only `/_next/static/*` | Pages and API responses depend on the logged-in session and must never be shared between users. Next.js build assets are content-hashed and immutable, so they are safe to cache for a year. |
| No cache invalidation on deploy | New builds produce new hashed asset URLs, and HTML is never cached, so a deploy never serves stale content. |
| `AllViewerExceptHostHeader` origin policy | Forwards cookies, query strings and geo headers, but keeps `Host` as the origin's name so TLS/SNI matches the Caddy certificate. |
| 60 s origin read timeout | Resume upload runs PDF parsing, LLM extraction and embedding synchronously; the 30 s default is too tight. |
| Backend never exposed | The FastAPI service has no auth; it's only reachable on the internal Docker network. |
| AWS Budget alarm | Alerts on the first cent of spend, so free-tier mistakes are caught immediately. |

---

## Step-by-step setup

### 0. Prerequisites
- Oracle Cloud account (Always Free), AWS account (choose the **paid plan**; CloudFront's
  always-free allowance applies there and the budget alarm guards spend), a DuckDNS account.
- Locally: Terraform ≥ 1.6, AWS CLI configured (`aws configure`) with an IAM user that can
  manage CloudFront and Budgets.

### 1. Create the VM (Oracle Cloud console)
1. **Compute → Instances → Create**: image *Canonical Ubuntu 24.04*, shape
   **VM.Standard.A1.Flex** (2 OCPU / 12 GB is plenty), add your SSH public key.
2. **Networking → VCN → Security List**: add ingress rules for TCP **80** and **443**
   (source `0.0.0.0/0`), and UDP 443 for HTTP/3.
3. Note the public IP.

> If you see "Out of host capacity", try another availability domain or retry later.

### 2. DuckDNS + bootstrap the VM
1. On duckdns.org create a subdomain (e.g. `yourapp`) pointing to the VM's IP; copy the token.
2. SSH into the VM and run:
   ```bash
   export DUCKDNS_SUBDOMAIN=yourapp DUCKDNS_TOKEN=xxxxxxxx
   git clone https://github.com/pranshu1606/mPHATEKApp1.git ~/app
   bash ~/app/infra/vm-setup.sh
   ```
   This installs Docker, opens the host firewall, sets up the DuckDNS updater and the nightly
   backup cron. Log out and back in afterwards.

### 3. Create the CloudFront distribution (locally)
```bash
openssl rand -hex 32            # → origin verify secret, keep it for step 4
cd infra/terraform
cp terraform.tfvars.example terraform.tfvars   # fill origin_domain, secret, alert_email
terraform init
terraform apply
terraform output                # public_url, oauth_callback_urls
```
Distribution creation takes a few minutes to propagate to all edge locations.

### 4. Configure and start the app (on the VM)
```bash
cd ~/app && cp .env.example .env && nano .env
```
Fill in the app secrets (`NEXTAUTH_SECRET`, OAuth IDs, `GEMINI_API_KEY`, `SUPER_ADMIN_EMAIL`)
and the production block:
```
PUBLIC_URL="https://dxxxxxxxxxxxx.cloudfront.net"
ORIGIN_HOST="yourapp.duckdns.org"
ORIGIN_VERIFY_SECRET="<same value as terraform.tfvars>"
ACME_EMAIL="you@example.com"
```
Then:
```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

### 5. OAuth callbacks
Add the URLs from `terraform output oauth_callback_urls` to your GitHub OAuth app
(Authorization callback URL) and Google OAuth client (Authorized redirect URIs).

### 6. CI/CD (GitHub → Settings → Secrets and variables → Actions)
Create an environment named **production**, then add:

| Kind | Name | Value |
|---|---|---|
| Secret | `VM_HOST` | VM public IP or `yourapp.duckdns.org` |
| Secret | `VM_USER` | `ubuntu` |
| Secret | `VM_SSH_KEY` | Private key of a deploy key pair (`ssh-keygen -t ed25519 -f deploy_key`); add `deploy_key.pub` to `~/.ssh/authorized_keys` on the VM |
| Secret | `VM_SSH_KNOWN_HOSTS` | Output of `ssh-keyscan <VM_HOST>` |
| Variable | `PUBLIC_URL` | `https://dxxxx.cloudfront.net` |
| Variable | `ORIGIN_HOST` | `yourapp.duckdns.org` |

Pipeline (`.github/workflows/ci-cd.yml`):
- **Every PR/push:** Next.js typecheck and build, Python dependency install and app import,
  `terraform fmt`/`validate`, production compose config validation, Docker image build.
- **Push to `main`:** SSH to the VM, `git reset --hard <sha>`, rebuild and restart with compose,
  then smoke-test through CloudFront and confirm the origin rejects direct traffic (403).

---

## Proving the edge works

```bash
URL=https://dxxxx.cloudfront.net

# Which edge location served you, and was it a cache hit?
curl -sI $URL/login | grep -iE 'x-cache|x-amz-cf-pop|server-timing'
#   x-cache: Miss from cloudfront        ← pages are never cached (by design)
#   x-amz-cf-pop: BOM78-P1               ← edge location (here: Mumbai)

# Static assets: second request is served from the edge
ASSET=$(curl -s $URL/login | grep -oE '/_next/static/[^"]+\.js' | head -1)
curl -sI $URL$ASSET | grep -i x-cache   # Miss from cloudfront
curl -sI $URL$ASSET | grep -i x-cache   # Hit from cloudfront

# Edge function blocks probes without touching the origin
curl -sI $URL/.env | head -1             # HTTP/2 403   (x-edge-blocked: true)

# Origin refuses traffic that bypasses CloudFront
curl -sI https://yourapp.duckdns.org/ | head -1   # HTTP/2 403
```

In the browser, open DevTools → Network → any request → **Timing**: the `Server-Timing`
header shows the edge POP and `cdn-cache-hit` / `cdn-cache-miss`.

## Operations

- **Logs:** `docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f`
- **Backups:** `infra/backup.sh` runs nightly at 03:30 UTC (stops the app ~10 s for a consistent
  SQLite/Chroma copy), keeps 7 archives in `~/backups`, and uploads to OCI Object Storage when
  `BACKUP_PAR_URL` is set (create a bucket → *Pre-Authenticated Requests* → *Permit object writes*).
- **Restore:** `docker compose ... down`, then
  `docker run --rm -v resume-portal_web-data:/r/web-data -v resume-portal_vector-data:/r/vector-data -v ~/backups:/b alpine tar xzf /b/<archive> -C /r`
- **Tear down edge:** `terraform destroy` in `infra/terraform`.

## Optional extensions
- **AWS WAF** on the distribution (managed rule groups, rate limiting on `/api/resumes/apply`).
  Paid on standard pricing; check whether AWS's flat-rate CloudFront plans (which bundle WAF)
  are available on your account.
- **Custom domain** via ACM certificate (us-east-1) + `aliases` on the distribution.
- **Remote Terraform state** in S3 with state locking.
