# Learn content

Add one JSON file to `content/articles/` and its compact metadata row to `content/articles-index.json`. The content registry discovers the body automatically; no page or route needs to be added. The index contains titles, excerpts, dates, category, reading time, FAQ summaries, and the related product CTA for cards and metadata, while Vite emits each full article as its own lazy chunk. Rebuild to publish it and update the sitemap. Static rendering includes each article in its own HTML page. No CMS, database migration, or new dependency is needed.

Copy an existing article and set a unique `category` + `slug`, `title`, `excerpt`, `introduction`, `author`, ISO `publishedAt` and `updatedAt`, `featured`, `sections`, `sources`, `cta`, and `faqs`. Category slugs are in `content/categories.js`. Reading time belongs in the compact index and should be recalculated from the body. Only published content belongs in this directory; keep drafts outside it. The sample examples use fictional amounts and identify them as planning illustrations.

Each section has a unique URL-safe `id`, a `title`, and `blocks`. Keep the sequence: problem → explanation → practical example → calculation → actionable steps → common mistakes → useful tips → conclusion. Sources render after the sections. Supported blocks:

- `paragraph`, `subheading`, `calculation`, `tip`: `{ "type": "paragraph", "text": "..." }`
- `list`, `steps`: `{ "type": "steps", "items": ["..."] }`
- `table`: `{ "type": "table", "caption": "...", "headers": ["Item", "Amount"], "rows": [["Rent", "18000"]] }`

Use text rather than raw HTML. Add real reference URLs in `sources: [{ "title": "...", "url": "https://..." }]`. Featured artwork is currently a decorative category-icon placeholder. Optional future article images use `image: { "src": "/images/guide.avif", "alt": "...", "width": 960, "height": 420 }`. Article cards lazy-load and asynchronously decode those fixed-dimension images to reduce layout shifts. Supply optimized AVIF/WebP artwork and appropriately compressed responsive sizes; no source images are included yet.

Use `cta: { "label": "Create your budget in Hisabki Kitab", "to": "/budget" }` to connect each guide to an existing financial feature. The optional `faqs` list contains `{ "question": "...", "answer": "..." }` and automatically renders a FAQ section plus FAQ structured data. The optional `ads` list supports `after-introduction`, `middle`, and `before-related`. Middle placements only render for articles with at least six minutes of content. Leave `ads` empty to show none. Only the budgeting demo enables two placeholders. AdSlot makes no requests and is used only by public article views.

For a local production build, set `VITE_SITE_URL` to the production canonical origin first (`$env:VITE_SITE_URL='https://<production-domain>.vercel.app'; npm run build` in PowerShell). This creates the usual SPA assets plus static HTML for the homepage, every category, every article and every tool; it also creates and validates `sitemap.xml` and `robots.txt`. The temporary SSR bundle is ignored. Vercel routes public content requests to these static files. Other static hosts must serve existing `path/index.html` files before their `/app.html` SPA fallback. The original SPA shell is preserved as `app.html` for private routes. Preserve the existing API routing.

Set `VITE_SITE_URL=https://<production-domain>.vercel.app` in the Vercel Production build environment. It must be an HTTPS origin with no path, query, or fragment. When it is absent, the generator uses Vercel's production-only `VERCEL_PROJECT_PRODUCTION_URL`; it never derives SEO URLs from a preview deployment. Builds without either production origin fail rather than publishing localhost or preview canonicals. The same origin is embedded for client-side metadata, canonical/OG URLs, structured data and the sitemap. The full public content and metadata can be read without JavaScript. Unknown client routes show a noindex not-found view; unknown static article URLs return the host's 404.

For Google Search Console on `hisabkikitab.com`, add the URL-prefix property `https://hisabkikitab.com/` and choose HTML tag verification. Domain properties require DNS verification. Copy the exact token from Google's verification dialog into Vercel Production as `VITE_GOOGLE_SITE_VERIFICATION`; the static homepage and public pages then include the optional meta tag. No token is currently hardcoded or configured. After verifying ownership, submit `https://hisabkikitab.com/sitemap.xml` in Search Console; submission and URL Inspection require the owner's Google account.

The existing GA4 integration is enabled only when a valid `VITE_GA_MEASUREMENT_ID` (`G-` plus 10 letters/digits) is present in Production. The script initializes once, disables GA's automatic page view, and sends a single sanitized page view on each client-side route change. Public content events are limited to `article_view`, `calculator_used`, `calculator_completed`, `core_feature_cta_clicked`, and `related_article_clicked`; their allowlisted values contain only category, calculator type, or core feature type. Calculator inputs and personal financial values are never included. With no valid ID, analytics remains disabled.

Verification: `npm run test:web`, `npm run build`, and `node node_modules/@playwright/test/cli.js test --config tests/browser/config.js tests/browser/learn.spec.js`. Category pages show nine articles per page.

## Implementation file manifest

Created:

- `apps/web/scripts/prerender.mjs`
- `apps/web/src/app/layout/PublicHeader.jsx`
- `apps/web/src/app/layout/PublicSiteLayout.jsx`
- `apps/web/src/app/prerender.jsx`
- `apps/web/src/features/learn/AdSlot.jsx`
- `apps/web/src/features/learn/Learn.test.jsx`
- `apps/web/src/features/learn/LearnContent.jsx`
- `apps/web/src/features/learn/LearnPage.jsx`
- `apps/web/src/features/learn/README.md`
- `apps/web/src/features/learn/content/articles-index.json`
- `apps/web/src/features/learn/content/articles/beginners-guide-to-personal-budgeting.json`
- `apps/web/src/features/learn/content/articles/emergency-fund-how-much-should-you-save.json`
- `apps/web/src/features/learn/content/articles/how-freelancers-can-manage-irregular-income.json`
- `apps/web/src/features/learn/content/articles/how-to-create-a-monthly-budget.json`
- `apps/web/src/features/learn/content/articles/how-to-manage-household-expenses.json`
- `apps/web/src/features/learn/content/articles/how-to-reduce-unnecessary-spending.json`
- `apps/web/src/features/learn/content/articles/how-to-save-money-every-month.json`
- `apps/web/src/features/learn/content/articles/how-to-set-financial-goals.json`
- `apps/web/src/features/learn/content/articles/how-to-split-expenses-with-roommates.json`
- `apps/web/src/features/learn/content/articles/how-to-track-money-you-lend-and-borrow.json`
- `apps/web/src/features/learn/content/articles/how-to-track-monthly-expenses.json`
- `apps/web/src/features/learn/content/articles/simple-ways-to-track-income-and-expenses.json`
- `apps/web/src/features/learn/content/categories.js`
- `apps/web/src/features/learn/content/index.js`
- `apps/web/src/features/learn/metadata.js`
- `apps/web/src/features/tools/content/calculations.js`
- `apps/web/src/features/tools/content/calculations.test.js`
- `apps/web/src/features/tools/pages/ToolsPage.jsx`
- `tests/browser/learn.spec.js`

Modified:

- `.gitignore`
- `apps/web/package.json`
- `apps/web/src/app/App.jsx`
- `apps/web/src/app/layout/Sidebar.jsx`
- `apps/web/src/app/providers/AnalyticsObserver.jsx`
- `apps/web/src/features/auth/AuthContext.jsx`
- `apps/web/src/main.jsx`
- `apps/web/src/shared/analytics/analytics.js`
- `apps/web/src/shared/analytics/analytics.test.js`
- `apps/web/src/shared/i18n/locales/en.json`
- `apps/web/src/shared/i18n/locales/roman-ur.json`
- `apps/web/vite.config.js`
- `scripts/find-dead-code.js`
- `vercel.json`
