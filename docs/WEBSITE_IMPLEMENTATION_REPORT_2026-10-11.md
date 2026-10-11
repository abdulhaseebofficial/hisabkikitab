# Website implementation and verification report

Date: 11 October 2026. Website: https://hisabkikitab.com/. Changes are local and uncommitted on the existing `main` branch. No push, deployment, DNS change, branch deletion, database migration or account configuration occurred.

## Conditional release preflight — 11 October 2026

Status: BLOCKED. The user conditionally authorized commit/push and the automatic production deployment, requiring a stop for any failed critical check or unresolved deployment risk. No commit or push occurred.

Verified through authenticated Vercel API: project `hisabkikitab` is linked to this GitHub repository, production branch main, Node 24, automatic Git deployments and domain assignment enabled. Both project Checks v2 and the existing deployment's integration checks return empty lists. GitHub main remains `34962be0ecf8a8bef8e9dbd28d6e20d1bf3e0d3e`, unprotected, without active rulesets. No safeguard was disabled. The local project-link name is stale; its ID correctly resolves to this live project.

Production has NODE_ENV, distinct JWT variable names, Postgres, CLIENT_URL, VITE_SITE_URL, GA measurement and SMTP configuration entries. Public build settings have not changed since the active successful deployment. The production GA value matches the reviewed stream. Sensitive variables are intentionally withheld from Vercel CLI local runs; their absence from exported CLI variables is not absence from production. Live health reports database connected, mail configured, password reset enabled, Google sign-in disabled and AI fallback. Delivery of reset mail was not tested. This current provider evidence supersedes earlier uncertainty about whether production SMTP is configured; it does not verify the support forwarding proposal.

**Release blocker:** there is no production CRON_SECRET entry. Vercel's daily cron is enabled for `/api/internal/recurring` at `5 0 * * *`; that endpoint requires a configured secret of at least 16 characters and fails closed otherwise. A request without authentication returned HTTP 503, before the handler's bootstrap or financial sweep. No recurring job or database mutation was triggered. Activating the job requires a separately approved production configuration change; scheduled runs can create due recurring-expense entries. Do not bypass the check or publish under the conditional authorization until the owner decides how to resolve or explicitly accepts this risk.

The exact 53 candidate files match the reviewed scope. A scan for private-key/token patterns and values from local secret variables found no matches. No `.env`, `.vercel`, ignored test output or credential file is a candidate. No files were staged. Existing services, API routing, server entrypoint and cron definition are unchanged by the reviewed diff. Only public-page routing/cache headers and the documented frontend/workflow/patch changes are included.

Current production deployment: `dpl_HJm2ic4UFTTSeqJMmhtCbDQKpLLT`, READY, serving https://hisabkikitab.com/, with the existing SHA above. This is the old deployment, not a deployment of these local changes. After-release redirect/performance/GA verification remains pending because no new release was attempted.

The final frontend production build passes using the current production GA value and the public canonical origin verified from the active site. The latter is explicitly supplied locally because Vercel withholds the sensitive VITE_SITE_URL entry from CLI runs. It generates 35 indexable public pages with the private shell excluded. This validates the frontend build; it does not claim a new hosted Vercel deployment or a full local validation of withheld runtime secret values.

| Major requirement | Overall status | Remaining gate |
| --- | --- | --- |
| Repository/public-site audit | PARTIALLY COMPLETE | Provider/private-integration verification remains |
| Main-only working policy | COMPLETE | All work uses existing main; no new branches or AI coauthors |
| One-branch repository cleanup | BLOCKED | Separate deletion approval |
| Trailing-slash SEO | PARTIALLY COMPLETE | Live deployment/redirect validation |
| Professional email receive/send | BLOCKED | Account access, delivery tests and approved exact records |
| Focused UI enhancements | PARTIALLY COMPLETE | Locally verified, production pending |
| Performance/caching | PARTIALLY COMPLETE | Local measurements only; production/field targets unverified |
| GA4 and Consent Mode v2 | PARTIALLY COMPLETE | Production transport and GA property verification |
| Workflow simplification | PARTIALLY COMPLETE | Provider-check review and publication |
| Additional quality/security audit | PARTIALLY COMPLETE | Remaining advisories/provider issues need reviewed follow-up |
| Local build and focused regression checks | COMPLETE | Database/private integration and production checks remain separate |
| Deployment | NOT STARTED | Release approval |
| Delivery report and setup guides | COMPLETE | Findings and limits documented |

## 1. Initial audit

Discovery is COMPLETE for the accessible repository and public website. Provider/property administration remains BLOCKED where access or approval is missing. See [initial audit](WEBSITE_AUDIT_2026-10-11.md).

Verified architecture: React 18, Router 6, Vite 5 and Tailwind 3 frontend; Node 24/Express API; PostgreSQL/pg with Supabase configuration; Vercel frontend and API services with a protected recurring-job cron. Public content is prerendered at build time; private financial screens use the existing authenticated application. No architectural rewrite or dependency addition was made.

Local main was behind GitHub. Fetching established that `release/phase2-production-hardening` had already been merged through PR #3. Local main was fast-forwarded to `34962be`. It was unnecessary to perform the separately approved merge again. No existing unmerged commits were discarded.

## 2. Problems identified

| Severity | Evidence | Resolution/status |
| --- | --- | --- |
| High | Live slash article redirects 308 to a no-slash URL; sitemap/canonicals used the no-slash form | PARTIALLY COMPLETE: page-only 301 rules and metadata fixed locally; production validation pending |
| High | Prerender and browser frames differ; articles replace useful static content with loading UI | PARTIALLY COMPLETE: shared frame, initial-route preparation and embedded initial article implemented and browser checked; production pending |
| High | Initial audit found one critical runtime dependency issue | COMPLETE locally: proxy-addr 2.0.8 installed and locked; runtime audit now has no high/critical findings; production pending |
| Medium | Auth/application layout code loaded for anonymous public pages | PARTIALLY COMPLETE: lazy loading implemented; entry bundle reduced; production pending |
| Medium | Analytics pageviews use incorrect public titles; lazy navigation could send the previous title | PARTIALLY COMPLETE: target metadata resolved before pageviews; local queue behavior verified |
| Medium | No user-controlled analytics consent | PARTIALLY COMPLETE: global default denial, Consent Mode v2 and accept/reject/preferences implemented; property/transport verification pending |
| Medium | Automatic CI integration takes about 234 seconds, compared with 47 seconds for static checks | PARTIALLY COMPLETE: automatic test/build/integration jobs removed locally, advisory security audit retained |
| Medium | No DMARC found; support alias and outbound mail not verifiable from DNS | BLOCKED: proposed architecture and instructions provided; no mail/DNS changes |
| Medium | Remaining development-tool vulnerabilities include high/critical findings | BLOCKED for upgrades outside patch scope; 16 total affected packages remain, including 4 moderate runtime findings |
| Unresolved | First production visit had high TTFB; subsequent desktop observation was much faster | Root cause not established; do not attribute this solely to JavaScript or claim the production latency is fixed |

Additional risks: `www` did not resolve; the typo `hisabikitab.com` returned NXDOMAIN. Apex HTTPS works and HTTP redirects to HTTPS. Search Console, field Core Web Vitals, GA ownership/settings, email aliases, provider-required checks, DNSSEC and current database backup/restore readiness were not established. Existing prelaunch documentation records backup/restore limitations; that historical record is not fresh provider verification. No financial-data migration or query change is included here.

## 3. Implemented changes

- Public page and authentication links use trailing slashes. APIs, files, assets, token routes and private financial routes are excluded from indiscriminate slash changes.
- Explicit permanent page redirects preserve queries; canonical, Open Graph, structured-data and sitemap references share the preferred URLs. Existing private noindex behavior and static 404 remain.
- Hashed asset browser caching is one year with immutable. HTML remains revalidated; no private/API responses were given public caching.
- Shared public layout geometry, lazy auth/app route code, initial article data, critical Latin font subsets/preloads and useful article-load failure feedback improve loading behavior without new libraries.
- Guides have responsive search/topic controls, result counts and clear/empty states. Subtle card movement is limited to hover-capable devices without reduced-motion preferences. Existing typography, colors and brand are preserved.
- Basic Consent Mode v2, bilingual consent text, 180-day choices, withdrawal and cross-tab synchronization gate application analytics. Page titles and sensitive-location handling are corrected; advertisements remain denied.
- Lengthy GitHub Actions test/build/database/browser steps are removed. The existing advisory dependency security check remains with read-only permissions and a five-minute timeout. Local tests remain available.
- Only proxy-addr 2.0.7 → 2.0.8 and source-map-js 1.2.1 → 1.2.2 were patched. shell-quote's available fix is a minor update, so it was left unchanged under patch-only approval. Framework major upgrades were not attempted.

## 4. Files changed

| Paths | Purpose |
| --- | --- |
| `vercel.json` | Page-only redirects, slash rewrites, auth shell route, asset cache and response headers; API services and cron preserved |
| `.github/workflows/ci.yml` | Replace automatic long test jobs with the retained advisory dependency audit |
| `package-lock.json` | Two approved patch updates; package manifests and dependency set unchanged |
| `apps/web/src/shared/seo/urls.js`, `PublicLink.jsx` | Shared canonical public/auth URL and link normalization |
| `apps/web/src/app/layout/PublicFrame.jsx`, `PublicSiteLayout.jsx`, `PublicHeader.jsx`, `PublicFooter.jsx`, `TrustFooterLinks.jsx` | Match browser/prerender layout, canonical navigation and privacy controls |
| `apps/web/src/app/App.jsx`, `prerender.jsx`, `routes/SeoBoundary.jsx`, `routes/ProtectedRoute.jsx`, `apps/web/src/main.jsx` | Lazy routes, initial route preparation, slash-aware SEO/auth routing |
| `apps/web/scripts/prerender.mjs`, `verify-public-seo.mjs` | Canonical sitemap/output, font preloads, safe initial article JSON and verification |
| `apps/web/src/features/learn/{HomeContent,LearnContent,LearnPage}.jsx`, `metadata.js` | Canonical links, guide filters, first article rendering and load errors |
| `apps/web/src/features/tools/pages/ToolsPage.jsx` | Canonical calculator links/metadata |
| `apps/web/src/features/trust/{TrustContent.jsx,metadata.js,content/pages.js}` | Slash handling, canonical links and consent privacy wording |
| `apps/web/src/features/auth/AuthContext.jsx`, `components/AuthShell.jsx`, `pages/{LoginPage,RegisterPage,ForgotPasswordPage,ResetPasswordPage}.jsx` | Slash-aware auth navigation and privacy choices |
| `apps/web/src/shared/analytics/{analytics.js,consent.js,ConsentBanner.jsx}`, `apps/web/src/app/providers/AnalyticsObserver.jsx` | Consent, origin gating, sanitized events and accurate pageview titles |
| `apps/web/src/shared/i18n/locales/{en,roman-ur}.json`, `apps/web/src/index.css` | Consent translations, existing font subsets and reduced-motion-aware interaction |
| Existing analytics, auth, Learn, trust and SEO test files | Update expected preferred URLs and validate consent behavior |
| `scripts/find-dead-code.js` | Recognize existing font dependencies imported by CSS |
| `scripts/{audit-site.cjs,verify-routing.mjs,serve-audit-builds.cjs,verify-website-browser.cjs}` | Reproducible public diagnostics, local hosting/routing and focused browser checks |
| This report, initial audit, `GA4_VERIFICATION.md`, `PROFESSIONAL_EMAIL_SETUP.md` | Findings, evidence, setup and approval gates |

## 5. Performance comparison

Production baseline: fresh unthrottled Chromium contexts on this Windows host. Mobile 390×844: TTFB 2.909s, LCP 4.040s, load 4.560s, CLS 0. Later desktop 1440×900: TTFB 0.182s, LCP 0.548s, load 1.325s, CLS 0. These are individual observations, not percentiles or a controlled mobile/desktop comparison.

The original production entry JavaScript was 358,657 bytes uncompressed. The final HTML entry script is 205,682 bytes, a 42.7% reduction. Other code remains in lazy chunks; this does not mean the total application bundle shrank by the same percentage.

The final local setup uses original and modified gzip-served builds, fresh contexts, cache disabled, 390×844, 4× CPU slowdown and three alternating runs/build, without concurrent builds/tests. Each run waits for the real homepage heading and fonts, takes a screenshot to confirm rendered content, then reads buffered paint observations. External Google traffic is blocked. Loopback network shaping was ineffective and is excluded from claims. These tests do not model production CDN latency or GA after acceptance. Earlier zero-LCP/loading-only samples were discarded.

| Local metric, median of three runs | Before | After |
| --- | ---: | ---: |
| LCP | 3.416s | 0.816s |
| Load event | 2.505s | 1.692s |
| Recorded resource transfer, excluding navigation HTML | 298,516 bytes | 266,183 bytes |
| CLS | 0.00469 | 0 |
| Loopback TTFB | 3.8ms | 3.1ms |

This demonstrates improvement under these local conditions only. The load event is not the same as completion of asynchronous application rendering. Loopback TTFB does not establish hosting/CDN improvement. Consent may make the measured content different from a previously accepted user's page. Raw results and visually inspected benchmark screenshots are in ignored `test-results/local-performance.json` and `benchmark-*.png`; full browser output is `test-results/browser-verification.json`. The same harness verified revalidated HTML and immutable hashed-asset cache headers locally; provider headers/hit rates still need live testing.

No production after-change measurements, field INP, 75th-percentile Core Web Vitals or mobile Lighthouse score are available. Targets are NOT STARTED for field verification. Changes are not proven to meet the requested targets.

## 6. SEO verification

PARTIALLY COMPLETE overall; COMPLETE for local generated-output/routing checks. Vercel's installed routing compiler verified 36 non-root public routes plus three authentication redirects: 301 to a slash URL, no repeat redirect, matching destination rewrite. Nine representative API/static/root paths remain excluded. The local HTTP harness checks every sitemap page for 200 and exact canonical, with query-preserving redirects on non-root pages. Twelve SEO tests check unique metadata, structured data, robots, noindex exclusions and the internal link graph.

Two empty categories remain noindex and outside the sitemap. There are 35 indexable sitemap URLs. HTTPS apex is the verified preferred hostname; www cannot be canonicalized through deployment rules while it is unresolved and unattached. No DNS change was attempted. Search engine indexing and live redirect behavior require approved deployment and Search Console access.

## 7. Google Analytics status

PARTIALLY COMPLETE. Existing production ID `G-WM44V0PJL7` and baseline HTTP 204 collection responses were verified. The application's new consent and route event queue pass local browser checks with mocked transport. No claim of new events arriving in DebugView, Realtime or standard reports is made. The root cause of the original reporting complaint remains unresolved without property access.

Before release, confirm production build variables `VITE_SITE_URL` and `VITE_GA_MEASUREMENT_ID`. Inspect enhanced measurement history pageviews to prevent duplication with manual SPA events. [Setup and verification instructions](GA4_VERIFICATION.md) distinguish script presence, transport, property ingestion and reporting.

## 8. Professional email status

Research is COMPLETE; receive/send setup is BLOCKED. DNS already points to Namecheap forwarding, but alias delivery is unknown. Recommended low-volume free architecture: retain forwarding into the supplied Gmail inbox, then use domain-verified SMTP2GO through Gmail Send mail as. Current limits are 1,000/month and 200/day; account acceptance, domain verification and exact approved DNS records are prerequisites. Cloudflare free routing alone does not provide free replies to arbitrary customers under its current sending terms.

[Email proposal and verification steps](PROFESSIONAL_EMAIL_SETUP.md) include current primary-source pricing links and the review process for SPF/DKIM/DMARC. No DNS, nameserver, forwarding or SMTP change occurred.

## 9. GitHub and deployment status

Branch review is COMPLETE. Work remains on existing main. Four remote branches exist; all non-main branch commits are contained in main. No open PRs, active rulesets or branch protections were found during inspection. Branch cleanup is BLOCKED pending approval; no branches were created/deleted and no AI coauthors were added.

Workflow simplification is PARTIALLY COMPLETE, pending publication. Vercel production deploys through the existing integration, and the latest recorded deployment of main succeeded. Provider-side required-check settings remain unknown; inspect them before pushing the changed workflow. Production release is NOT STARTED pending approval. A push to main can publish these changes automatically.

## 10. Outstanding issues and verification limits

- Production deployment approval and provider required-check/build-variable review.
- Live redirects, cache headers, API/auth regression smoke checks and after-deployment measurements.
- GA property access, automatic-event settings and actual consent/Realtime/DebugView verification.
- Namecheap alias/account inspection and SMTP2GO account verification; approval of generated authentication/DMARC records before edits.
- Remaining dependency vulnerabilities need separately reviewed minor/major upgrades; do not bulk audit-fix.
- Database-backed/destructive integration tests were not run against production. Private financial flows, Google sign-in, SMTP recovery mail and recurring cron execution are not newly verified by the public browser suite. Existing backend behavior and deployment configuration were preserved.
- No cache-hit-rate history, real-user INP/percentile data or Search Console access was available. Published content changes invalidate hashed assets and rebuild prerendered HTML; provider HTML/CDN invalidation still needs live verification.

## 11. Recommended next actions and validation

The build, 225 backend unit tests, 270 frontend tests, 12 SEO tests and repository boundaries/shadowing/dependency checks pass locally. Browser checks cover mobile/tablet/desktop, public sitemap routes, redirects, correct pageview titles, consent controls, guide search, keyboard Escape navigation and no page exceptions/overflow. Screenshots were visually inspected. Google transport is mocked for consent/pageview QA, not treated as evidence of property collection.

1. Review these local changes and approve commit/push to existing main, understanding that this may trigger Vercel production. No database migration or DNS change is part of that approval.
2. Confirm provider checks/build configuration, publish through the existing procedure, then verify live routes/cache/auth/API behavior and record comparable production performance.
3. Verify the existing GA property and complete consent/collection diagnostics.
4. Verify Namecheap forwarding, then review exact SMTP authentication records and approve email changes separately.
5. Approve deletion of already-merged non-main branches separately if the one-branch goal remains desired.
6. Review the remaining dependency upgrades and provider operational/backup readiness as separate proposals.

## Reproduce local public checks

From the repository root: run `npm ci`, build with the verified production site origin and stream ID, then `npm run test:unit`, `npm run test:web`, `npm run test:seo`, and the existing three check scripts. `node scripts/verify-routing.mjs` uses the already installed global Vercel CLI routing compiler; `VERCEL_CLI_CHUNKS` can point to its chunks directory. No compiler dependency was added to the project.

For before/after browser checks, preserve an original build in ignored `test-results/before-dist` before changing source, build current output, run routing verification, then start `node scripts/serve-audit-builds.cjs` in a separate terminal and run `node scripts/verify-website-browser.cjs`. Ports 4180/4181 are bound to loopback. This serves public files only and cannot verify real API functionality. Outputs/screenshots go into ignored `test-results/`; the original snapshot is a local artifact and is not committed. `SKIP_PERFORMANCE=true` reruns only functional checks using existing measurements and must not be described as a fresh benchmark.
