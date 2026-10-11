# Website audit — 11 October 2026

## Verified discovery and initial plan

- Repository: abdulhaseebofficial/hisabkikitab. Work is on existing main, synchronized to GitHub commit 34962be. The release branch was already merged in PR #3. No branch was created, deleted, or newly merged; local main was fast-forwarded.
- React 18, React Router 6, Vite 5, Tailwind; Express/Node 24 API; PostgreSQL through pg, with Supabase configuration. Public HTML is generated at build time. Private financial pages remain a client application with cookie authentication. Integrations include Google sign-in, GA4, SMTP, Gemini/Anthropic, and a protected recurring-expense cron.
- Vercel serves production. GitHub records a Production deployment of main. Namecheap nameservers and forwarding MX/SPF are active. No DMARC record was found. Forwarding alias destinations and outbound authentication remain unknown.
- Four remote branches, no open PRs, no branch protections or active repository rulesets. Both fix branches and the release branch have no commits missing from current main. Recommend deletion only after user approval.
- One Actions workflow, ci.yml: static structure/tests/build/advisory dependency audit, plus Postgres migrations/database/API/Chromium integration. Latest durations: 47 seconds static, 234 seconds integration. Vercel deployment is independent according to GitHub deployment records; provider-side required-check configuration remains to be checked before publishing.
- Local environment files inspected by key name/configured state only. They are ignored. Downloaded production env file is a stale snapshot, not authoritative current Vercel configuration. Never use it as evidence that production secrets are absent.

## Findings and priorities

| Severity | Verified finding | Focused remedy |
| --- | --- | --- |
| High | Vercel trailingSlash:false reverses the requested canonical form: sample no-slash article 200, slash article 308 back to no slash. Metadata and sitemap also omit slashes. | Explicit page-only 301 redirects, matching rewrites, shared canonical URL/link normalization. Exclude APIs/assets. |
| High | Prerender and browser use different container widths/layout trees. React createRoot replaces static content, and article detail replaces full prerender content with loading skeletons. | Share public page frame, preload entry fonts, preserve prerender content until route/article code is ready. |
| Medium | Initial entry bundle includes all auth screens and application layout even for anonymous readers. | Lazy-load these route components; retain existing dependencies. |
| Medium | AnalyticsObserver labels Learn/trust/calculator pageviews Not found. | Resolve route-specific titles, normalize slash variants, sanitize automatic config location/referrer. |
| Medium | Lengthy automatic integration job dominates CI. | Remove automatic test jobs; retain existing advisory dependency audit; keep local tests/build commands. |
| Medium | support alias delivery and outgoing SMTP are unverified; no DMARC found. | Propose Namecheap forwarding + verified free SMTP provider; approval required for DNS/account changes. |

## Baseline evidence

Read-only production browser script: scripts/audit-site.cjs. Detailed output/screenshots in ignored test-results/. Fresh Chromium contexts, Windows, unthrottled CPU/network; one mobile and one desktop observation, not field percentiles, INP or Lighthouse.

| Condition | TTFB | LCP | load event | CLS |
| --- | ---: | ---: | ---: | ---: |
| 390×844 mobile viewport, first run | 2.909s | 4.040s | 4.560s | 0 |
| 1440×900 desktop viewport, later run | 0.182s | 0.548s | 1.325s | 0 |

Production response was Vercel cache HIT. Separate curl root observation: TTFB 1.226s, 31,747 bytes. Network/connection variability is substantial; root cause of slow first TTFB is not established. No uncaught JavaScript exceptions or horizontal overflow in these two homepage runs. GA script present; one page_view HTTP 204 observed per run, plus an aborted collect request around navigation/context closure. Property DebugView/Realtime and duplicate enhanced-measurement configuration need access; do not call GA fully restored.

Local baseline production entry JS: 358,657 uncompressed bytes (index-BUCmUWwl.js). Build succeeded. Benchmark local before/after separately from production.

## Approval/access gates

- DNS, nameserver, SMTP account changes: explicit approval after reviewing generated provider records and existing DNS inventory. Destination inbox supplied; latest user instruction supplies the working hisabkikitab.com domain. Confirm the registered spelling in Namecheap before account changes.
- User authorized worldwide analytics consent controls including EEA/UK, with accept/reject and Consent Mode v2. Existing production measurement ID was verified. GA property access remains unavailable.
- Production push/deployment: final approval after local validation. A push to main may trigger production.
- Branch deletions: separate approval, even though branches are already merged.
- No production database migrations, financial-data writes, authenticated exports, or destructive database tests are authorized by this audit.

Implementation and final evidence: [delivery report](WEBSITE_IMPLEMENTATION_REPORT_2026-10-11.md), [GA4 guide](GA4_VERIFICATION.md), [professional email proposal](PROFESSIONAL_EMAIL_SETUP.md). Only compatible patch updates were approved and applied. Local build/regression checks pass; production release and DNS/branch cleanup remain gated.
