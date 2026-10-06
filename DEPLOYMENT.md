# Deployment: AWS EC2 (Graviton) behind CloudFront

The app runs on a single **EC2 t4g.small** (Arm) in **ap-south-1 (Mumbai)** and is served
worldwide through **CloudFront** edge locations. All infrastructure is Terraform; GitHub
Actions builds arm64 images and deploys through **SSM Run Command** using **OIDC** — no SSH
port, no AWS keys stored in GitHub.

## Architecture

```
                 ┌──────────────────────────────────────────────────────────┐
  Users ──HTTPS──► Amazon CloudFront (600+ edge locations, PriceClass_All)  │
  (anywhere)     │  • TLS termination + HTTP/3 at the nearest edge          │
                 │  • CloudFront Function (viewer-request): blocks scanner  │
                 │    paths (/.env, /.git, *.php …) before the origin       │
                 │  • /_next/static/*  → cached at edge (immutable assets)  │
                 │  • /api/*, pages    → not cached, cookies forwarded       │
                 │  • Security headers + Server-Timing added at the edge    │
                 │  • AWS Shield Standard DDoS protection                   │
                 └───────────────┬──────────────────────────────────────────┘
                                 │ HTTPS + X-Origin-Verify: <secret>
                                 ▼
  VPC (default) ── Security group: 443 ← CloudFront prefix list ONLY
                 │                  80 ← ACME challenge only, no SSH at all
  ┌──────────────▼──────────────────────────────────────────────────────────┐
  │ EC2 t4g.small · Ubuntu 24.04 arm64 · IMDSv2 · encrypted gp3 · EIP        │
  │ docker compose (project: resume-portal)                                 │
  │  caddy :443 ── Let's Encrypt cert, 403 unless X-Origin-Verify matches   │
  │     └─► frontend :3000 (Next.js, NextAuth, SQLite)     [internal only]  │
  │            └─► backend :8000 (FastAPI, LangChain, Chroma) [internal]    │
  │  nightly backup.sh ──► S3 (instance role, 14-day lifecycle)             │
  └─────────────────────────────────────────────────────────────────────────┘
        ▲ SSM Run Command (deploy)            ▲ docker pull (arm64 images)
        │                                     │
  GitHub Actions ── OIDC → IAM role ──────────┘── GHCR ◄── build on ubuntu-24.04-arm
```

### Design decisions

| Decision | Why |
|---|---|
| Single EC2 VM, not serverless | The app keeps state on disk (SQLite, PDFs, Chroma) and the ML stack needs > 1 GB RAM. |
| Graviton (t4g) + Mumbai | Cheapest instance family that fits; origin close to the primary users. CloudFront serves everyone else from their nearest edge. |
| Security group allows 443 only from `com.amazonaws.global.cloudfront.origin-facing` | Network-level guarantee that only CloudFront can reach the app. |
| `X-Origin-Verify` secret header (checked by Caddy) | Second layer: other CloudFront distributions share those IPs, so the header proves it's *our* distribution. |
| DuckDNS hostname for the origin | CloudFront origins must be DNS names, and Let's Encrypt won't issue certs for `*.amazonaws.com`, so a hostname enables end-to-end HTTPS. |
| No SSH; SSM Session Manager + Run Command | No port 22 to attack, no SSH keys to manage, every command is audited in SSM. |
| GitHub OIDC → IAM role | Short-lived credentials scoped to `repo:…:environment:production`, allowed only to run SSM commands on this one instance. |
| Images built in CI on native Arm runners | The 2 GB VM never compiles anything; deploys are a fast `docker pull`. |
| Cache only `/_next/static/*` | Pages/API depend on the session; hashed build assets are immutable and safe to cache for a year. No invalidations needed on deploy. |
| `cpu_credits = "standard"` | A burstable instance can't run up surprise "unlimited" CPU credit charges. |
| IMDSv2 required | Blocks SSRF-style metadata credential theft. |
| Budget excludes credits | Alerts track real burn rate against the credit balance. |

---

## Cost (Free plan, $100 credits)

| Item | ≈ / month |
|---|---|
| EC2 t4g.small (Mumbai) | $9–12 |
| Public IPv4 (Elastic IP) | $3.65 |
| 20 GB gp3 | ~$1.8 |
| S3 backups (tiny, 14-day expiry) | < $0.10 |
| CloudFront (always-free 1 TB, 10 M requests) | $0 |
| **Total** | **≈ $15–17** |

$100 lasts ~6 months. To stretch it: set `instance_type = "t4g.micro"` (≈ $6/mo, slower), or
stop the instance when you're not demoing (EC2 console → Instance state → Stop; the IP still
costs $3.65/mo). Check *Billing → Credits* regularly.

> **Free plan:** AWS will not charge your card, but the account closes when credits run out or
> the plan expires. **Download your latest backup from S3 before then.**

---

## Setup

### 0. Prerequisites (done once)
- AWS CLI configured (`aws sts get-caller-identity` works) and Terraform ≥ 1.6 installed.
- A DuckDNS account: create a subdomain (e.g. `yourapp`); the IP can be anything for now,
  the VM updates it on boot. Copy the **token**.

### 1. Merge the PR → images get built
Merge into `main`. CI builds arm64 images and pushes them to GHCR. The deploy job is skipped
because the infrastructure doesn't exist yet.

Then make both packages public (one-time): GitHub → your profile → **Packages** →
`resume-portal-frontend` → **Package settings** → **Change visibility → Public**. Repeat for
`resume-portal-backend`.

### 2. Create the infrastructure
```bash
cd infra/terraform
cp terraform.tfvars.example terraform.tfvars
#   duckdns_subdomain, duckdns_token, alert_email
#   origin_verify_secret = output of: openssl rand -hex 32   (keep it for step 3)
terraform init
terraform apply
terraform output
```
Takes ~5 minutes. The VM boots, installs Docker, adds swap, points DuckDNS at its Elastic IP,
and clones the repo. Confirm the subscription email for the budget alerts.

### 3. Configure and start the app on the VM
EC2 console → **Instances** → select `resume-portal-origin` → **Connect** →
**Session Manager** → **Connect** (a browser shell, no SSH). Then:
```bash
sudo -iu ubuntu
tail -n 5 /var/log/cloud-init-output.log     # should end with "Bootstrap complete"
cd ~/app && cp .env.example .env && nano .env
```
Fill in:
- `NEXTAUTH_SECRET` (new: `openssl rand -base64 32`), `SUPER_ADMIN_EMAIL`, GitHub/Google OAuth
  IDs and secrets, `GEMINI_API_KEY`, `GROQ_API_KEY`
- `PUBLIC_URL`, `ORIGIN_HOST`, `BACKUP_S3_URI` from `terraform output`
- `ORIGIN_VERIFY_SECRET` (same as `terraform.tfvars`), `ACME_EMAIL`

```bash
bash infra/deploy.sh
```

### 4. OAuth callbacks
Add the URLs from `terraform output oauth_callback_urls` to the GitHub OAuth app
(*Authorization callback URL*) and the Google OAuth client (*Authorized redirect URIs*).
Open `PUBLIC_URL` and sign in.

### 5. Turn on continuous deployment
GitHub repo → **Settings → Environments → New environment** → `production` (no secrets
needed). Then **Settings → Secrets and variables → Actions → Variables** (repository
variables) — values from `terraform output`:

| Variable | From |
|---|---|
| `EC2_INSTANCE_ID` | `ec2_instance_id` |
| `AWS_REGION` | `aws_region` |
| `AWS_DEPLOY_ROLE_ARN` | `github_deploy_role_arn` |
| `PUBLIC_URL` | `public_url` |
| `ORIGIN_HOST` | `origin_host` |

**Actions → CI/CD → Run workflow** on `main`. From now on every push to `main` runs:
typecheck/build → backend import → terraform/compose/shell validation → arm64 image build &
push → SSM deploy of that exact commit → smoke test through CloudFront → check that the origin
is unreachable directly.

---

## Proving the edge works

```bash
URL=https://dxxxx.cloudfront.net

# Which edge location served you, and was it cached?
curl -sI $URL/login | grep -iE 'x-cache|x-amz-cf-pop|server-timing'
#   x-cache: Miss from cloudfront        ← pages are never cached (by design)
#   x-amz-cf-pop: BOM78-P1               ← edge location code (BOM = Mumbai)

# Static assets: second request is served from the edge
ASSET=$(curl -s $URL/login | grep -oE '/_next/static/[^"]+\.js' | head -1)
curl -sI $URL$ASSET | grep -i x-cache   # Miss from cloudfront
curl -sI $URL$ASSET | grep -i x-cache   # Hit from cloudfront

# Edge function blocks probes without touching the origin
curl -sI $URL/.env | head -1             # HTTP/2 403   (x-edge-blocked: true)

# The origin can't be reached directly
curl -m 10 -sI https://yourapp.duckdns.org/ || echo "blocked by security group"
```
In the browser: DevTools → Network → a request → **Timing** shows `Server-Timing` with the
edge POP and `cdn-cache-hit` / `cdn-cache-miss`. Try from a VPN in another country to see a
different POP.

## Operations

| Task | How |
|---|---|
| Shell on the VM | EC2 console → Connect → Session Manager, or `terraform output ssm_session_command` (needs the Session Manager plugin) |
| Logs | `docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f` |
| Manual deploy / rollback | `bash infra/deploy.sh <git-sha>` (every commit's images are tagged by SHA) |
| Backups | Nightly 03:30 UTC: ~10 s pause for a consistent SQLite/Chroma copy, 7 kept locally, uploaded to S3 (expire after 14 days) |
| Restore | `docker compose … down`, then `docker run --rm -v resume-portal_web-data:/r/web-data -v resume-portal_vector-data:/r/vector-data -v ~/backups:/b alpine tar xzf /b/<archive> -C /r`, then `bash infra/deploy.sh` |
| Change instance size | Edit `instance_type` in `terraform.tfvars`, `terraform apply` (brief stop/start) |
| Tear everything down | `terraform destroy` |

## Optional extensions
- **AWS WAF** on the distribution (managed rules, rate limit on `/api/resumes/apply`); paid
  on standard pricing (check the flat-rate CloudFront plans).
- **Custom domain**: ACM certificate in us-east-1 + `aliases` on the distribution.
- **Remote Terraform state** in S3 with state locking.
