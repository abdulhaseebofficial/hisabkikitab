# Trust foundation implementation audit

Audit date: 28 September 2026. This is an internal implementation note, not a public page.

## Verified in the codebase and current production project

- Accounts use name, email, password hash (bcrypt), currency, optional university/hostel and monthly-income fields, finance mode, language/theme preferences, and custom categories. Password and reset-token material is excluded from public user responses.
- Financial records include income/expenses, budgets, goals, lending/borrowing, shared-living records, and AI Advisor chat history. Users can export their data or delete their account; deletion cascades through dependent application tables. No fixed data-retention schedule is implemented in the application.
- Authentication uses `hw_access` and `hw_refresh` HTTP-only cookies. Production cookies are Secure; SameSite defaults to Lax. Access-token memory state is not persisted in localStorage.
- localStorage stores the `hw-theme` theme preference, language preference, and a user-keyed Shared Living space/month selection. No sessionStorage usage was found.
- Vercel Production has `VITE_GA_MEASUREMENT_ID`; the live bundle has a valid-format ID and loads the existing GA4 integration. Event parameters are allow-listed. Tests cover the five requested Learn/Tools events and reject monetary values, names, and arbitrary extra fields. Page views send route paths and fixed titles, not query-string values.
- The API's public health endpoint reports database connected, AI Advisor in fallback mode, and mail not configured. The current production auth config reports Google sign-in disabled. Current Vercel Production variable names contain no Gemini/Anthropic or SMTP keys.
- The in-app feedback form is available only to authenticated users. Type, optional rating, message, and page are stored in PostgreSQL and associated with the account. SMTP forwarding is conditional; current production reports mail not configured. There is no public contact form or newsletter signup.
- The public contact email is loaded from `packages/contracts/vocabulary.json` through the shared `DEVELOPER` configuration and used by existing contact links.
- API request logs include request metadata (remote address, time, method, sanitized URL, status, referrer, user-agent); reset tokens are scrubbed from URLs. No third-party error-monitoring SDK was found.
- The current production API reports Advisor fallback mode, so user financial context is not currently sent to an external Gemini/Anthropic provider. The code supports those providers if a server key is configured later.
- Public site and API deploy on Vercel and use PostgreSQL. Production database vendor/region and vendor backup settings cannot be identified from application code.

## Owner confirmation required

- Confirm the operational mailbox in the shared `DEVELOPER.email` setting is monitored and appropriate for privacy requests.
- Confirm the exact PostgreSQL provider, data region, backup behavior, and deletion/backup-retention schedule. The application deletes account rows and dependent records but cannot verify infrastructure backup expiry.
- Confirm Vercel access-log/runtime-log retention settings and whether the production API is ever deployed outside the linked Vercel project.
- Review whether the current GA4 collection needs a consent banner or an in-product opt-out for the audience/jurisdictions served. No analytics consent UI or analytics toggle exists in the application.
- Before enabling Gemini/Anthropic, Google sign-in, SMTP, or advertising, re-audit what data those providers receive and update the public Privacy Policy. AdSense and advertising scripts are not enabled in this deployment.
- Review the Terms' copyright, liability, and service-availability wording with the product owner or qualified counsel for intended operating jurisdictions. The registration checkbox is validated by the client, but no accepted terms version/timestamp is recorded in the account database.

Do not publish this file as part of the public site. It records implementation facts and open operational/legal questions only; it is not a compliance certification.
