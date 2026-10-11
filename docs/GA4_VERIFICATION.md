# GA4 setup and verification — 11 October 2026

Status: PARTIALLY COMPLETE. Local application behavior is verified; production deployment and property-side collection/settings are not verified.

## Existing property before creating anything

The production JavaScript contains GA4 measurement ID `G-WM44V0PJL7`. Baseline browsing observed Google collection responses with HTTP 204. This establishes requests reaching the collection endpoint, not ownership of the property, report availability or the reason for the reported reporting problem.

Sign into Google Analytics and inspect Admin → Data streams for the web stream matching this ID and `https://hisabkikitab.com/`. Do not create a second property if this is an existing accessible stream. If it is missing from your account, ask the property owner to grant access. Viewer access permits report inspection; Editor access is needed for stream/settings changes. Use Google's property access management rather than sharing credentials. If no owner/property can be established, creation of a replacement property and updating its measurement ID require a reviewed decision.

## Required deployment configuration

- Production build: `VITE_SITE_URL=https://hisabkikitab.com` and the verified stream's `VITE_GA_MEASUREMENT_ID`.
- Development/preview remain disabled by default. `VITE_GA_ENABLE_LOCAL=true` explicitly overrides this only for deliberate QA. Do not enable it generally in preview environments.
- Vite embeds these values at build time; changing them requires rebuilding. The measurement ID is public, but no account passwords or credentials belong in source.
- In the GA4 stream's Enhanced measurement → Page views advanced settings, inspect and disable **Page changes based on browser history events** when using the application's manual SPA pageviews. The application sets `send_page_view:false`; this alone does not establish the property's enhanced measurement configuration. Obtain approval for property changes.

## Consent behavior implemented

Basic Consent Mode v2: analytics_storage, ad_storage, ad_user_data and ad_personalization default to denied. Google Analytics is loaded only after explicit acceptance. Acceptance grants analytics only; advertising remains denied. Equal accept/reject controls apply worldwide, including the EEA and UK. Choices are stored for 180 days, with an in-memory fallback when storage is unavailable. Privacy choices are available in public, private and authentication footers.

Rejecting prevents initial analytics loading. Withdrawal stops application events, sets Google's measurement disable flag and deletes accessible first-party GA cookies without deleting authentication cookies. Cross-tab consent changes are synchronized. Loaded third-party code is not unloaded by withdrawal; property settings and the real Google transport still need verification after deployment. No claim of legal certification follows from implementing Consent Mode; site-owner decisions about retention, notices, processing agreements and regional obligations remain separate. [Google consent implementation](https://developers.google.com/tag-platform/security/guides/consent).

Manual pageviews use canonical public paths and correct route titles. Token routes are normalized and queries/referrers are excluded from application-supplied analytics fields. Existing events use an allowlist of names and values, excluding financial amounts, email addresses and user-entered text. Inspect enhanced-measurement events separately because property settings can enable additional automatic collection.

## Evidence and remaining checks

Local browser checks mock Google's transport to avoid polluting the real property. They verify no script request before consent/rejection, persistence after reload, one application pageview on each tested SPA route with correct titles, and no further application events after withdrawal. This validates application behavior, not actual GA event ingestion.

After approved deployment:

1. Use a fresh browser profile without blockers. Verify no Google analytics request before choosing. Reject, reload and check again.
2. Accept analytics. Inspect gtag loading and collect requests, consent state and the measurement ID. Use Tag Assistant's consent diagnostics. [Consent debugging](https://developers.google.com/tag-platform/security/guides/consent-debugging).
3. Navigate home → Learn → Tools → About using site links. Verify exactly one pageview per navigation, correct path/title and no sensitive query/token values. Inspect enabled automatic events too. [GA4 manual pageviews](https://developers.google.com/analytics/devguides/collection/ga4/views).
4. Open the property's Realtime and use a deliberate DebugView session to verify the same events and consent behavior. Property access is required. [DebugView](https://support.google.com/analytics/answer/7201382).
5. Withdraw through Privacy choices. Confirm application events cease and cookies are removed. Repeat on mobile and another tab.
6. Check standard reports after Google's processing delay. Do not treat a delayed standard report as proof of a code failure. Realtime/DebugView, HTTP transport and standard reports are different verification stages.

Root cause of the original reporting complaint remains unresolved without property access. Confirmed application defects fixed here were incorrect public-route titles, consent controls absent, and tracking configuration needing stricter origin and sensitive-location handling.
