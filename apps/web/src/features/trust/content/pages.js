export const LAST_UPDATED = '28 September 2026';

export const trustPages = {
  about: {
    path: '/about',
    title: 'About Hisab Ki Kitab',
    description: 'Learn how Hisab Ki Kitab helps people manage individual, household, and shared living finances.',
    intro: 'Hisab Ki Kitab is a financial-management platform for keeping everyday money clear and organized.',
    sections: [
      { heading: 'Manage money in the way you live', paragraphs: ['Use the platform to track income and expenses, plan budgets, set goals, keep lending and borrowing records, and review reports. The AI Advisor can help explain patterns in the information you enter.'] },
      { heading: 'Individual finances', paragraphs: ['Keep a personal view of your money, from day-to-day spending to budgets and savings goals.'] },
      { heading: 'Household finances', paragraphs: ['Organize household income and expenses so regular costs and plans are easier to review together.'] },
      { heading: 'Shared Living', paragraphs: ['Track shared expenses and contributions for a room, flat, hostel, or other shared arrangement.'] },
      { heading: 'Supporting resources', paragraphs: ['Learn guides and financial calculators provide practical explanations and estimates alongside the core money-management features. They support the platform; they are not the product’s main purpose.'], links: [{ label: 'Explore financial guides', to: '/learn' }, { label: 'Open financial tools', to: '/tools' }] },
    ],
  },
  contact: {
    path: '/contact',
    title: 'Contact Hisab Ki Kitab',
    description: 'Contact Hisab Ki Kitab about the financial-management platform, your account, or privacy questions.',
    intro: 'For questions about Hisab Ki Kitab, your account, or this website’s privacy information, use the contact details below.',
    sections: [
      { heading: 'Email', paragraphs: ['This address is configured in the project’s shared contact settings. Choosing it opens your email application; the public website does not submit or store a contact form.'] },
      { heading: 'In-app feedback', paragraphs: ['Signed-in users can send feedback from the application. Feedback is saved to the application database. Email forwarding is currently not configured for the production API, so use the email link above for a direct message.'] },
    ],
    showEmail: true,
  },
  privacy: {
    path: '/privacy',
    title: 'Privacy Policy',
    description: 'How Hisab Ki Kitab handles account details, financial records, browser storage, and Google Analytics.',
    intro: 'This policy describes data handling verified in the current Hisab Ki Kitab application and production configuration.',
    lastUpdated: LAST_UPDATED,
    sections: [
      { heading: 'Information stored in your account', paragraphs: ['An account can contain your name and email address, a password hash for password sign-in, currency, finance mode, language and theme preferences, monthly income, university or hostel details, and custom categories. Passwords are stored as bcrypt hashes; the application does not store the original password.', 'Records you enter can include income and expenses (amounts, dates, categories and notes), budgets, goals, lending and borrowing details, shared-living groups and contributions, and messages exchanged with the AI Advisor. The application uses these records to provide its financial-management features, summaries, reports, reminders, and Advisor responses.'] },
      { heading: 'Authentication and browser storage', paragraphs: ['The browser uses first-party HTTP-only session cookies named hw_access and hw_refresh for signed-in requests. In production the cookies are Secure; the default SameSite policy is Lax. The access token is also held in memory while the page is open, not in localStorage. The application uses localStorage for theme and language preferences and for the selected Shared Living space and month. No sessionStorage use was found in the application code.'] },
      { heading: 'Google Analytics', paragraphs: ['Google Analytics 4 is configured in the current production build to understand how the application is used. It receives page views and allow-listed interaction metadata such as content category, calculator type, or feature type. Google documents that its default web collection can use a first-party _ga cookie to distinguish users and sessions and can collect browser/device details and approximate location. The integration disables Google Signals and advertising-personalization signals.', 'The analytics event code filters parameters through fixed allow-lists. It does not send entered income, expense, debt, balance, roommate-name, note, or other calculator values as analytics event parameters. There is no in-app analytics preference switch; browser controls can clear or block cookies, though blocking session cookies can prevent sign-in.'] , externalLinks: [{ label: 'Google Analytics data collection details', href: 'https://support.google.com/analytics/answer/11593727' }, { label: 'Google Privacy Policy', href: 'https://policies.google.com/privacy' }] },
      { heading: 'Other services and integrations', paragraphs: ['The website and API are deployed through Vercel and use a PostgreSQL database. The code does not identify the database hosting provider or its backup-retention schedule; those details are not stated here.', 'The AI Advisor uses rule-based responses when no external AI provider is configured. If Gemini or Anthropic is configured, Advisor requests can send your currency, income and spending summaries, category names, budget limits, goal titles and progress, and the question and chat history you provide to that provider to generate a response. The Advisor does not need your account name for this request. Google sign-in is available only when its provider configuration is enabled.', 'The project includes an authenticated feedback feature. Feedback type, optional rating, message, and page are stored in the application database and are associated with the signed-in account. Email delivery depends on server configuration. There is no public contact form or newsletter signup in the current application.'] },
      { heading: 'Operational logs', paragraphs: ['The API writes access-log entries that can include IP address, time, request method, sanitized URL, response status, referrer, and browser user-agent. Password-reset tokens are removed from logged URLs. The application code does not define a log-retention period; Vercel’s service-level log retention should be confirmed by the owner.'] },
      { heading: 'Retention and your choices', paragraphs: ['You can export your account data or delete your account from Settings. Account deletion removes the user row and its dependent application records through database cascades. The code does not establish how long infrastructure backups retain deleted records, so deletion from backups cannot be promised here. No other fixed retention schedule was found in the application code.', 'You can edit supported profile fields, sign out to clear the active session cookies, and clear browser storage through your browser settings. Blocking cookies may affect sign-in and other application behavior.'] },
      { heading: 'Security', paragraphs: ['The application hashes passwords with bcrypt, stores hashes rather than usable refresh tokens, and uses HTTP-only, Secure production session cookies. The live site uses HTTPS. These measures reduce risk but cannot guarantee that every system or transmission is completely secure.'] },
      { heading: 'Contact and updates', paragraphs: ['For privacy questions, contact Hisab Ki Kitab using the address on the Contact page. This policy may be updated when data handling changes; the displayed date identifies the latest content review.'] },
    ],
  },
  terms: {
    path: '/terms',
    title: 'Terms of Use',
    description: 'Terms for using Hisab Ki Kitab’s financial-management platform, calculators, and financial guides.',
    intro: 'These terms describe basic expectations when you use Hisab Ki Kitab. Please also read the Privacy Policy and Disclaimer.',
    lastUpdated: LAST_UPDATED,
    sections: [
      { heading: 'Using the service', paragraphs: ['Hisab Ki Kitab provides account-based tools for managing individual, household, and shared living finances, together with supporting guides and calculators. You may use the service for your own lawful financial organization and planning.'] },
      { heading: 'Your account', paragraphs: ['Provide accurate account details and take reasonable care of your sign-in credentials. You are responsible for activity through your account and should tell us if you believe it has been accessed without permission. Do not access another person’s records without their authorization.'] },
      { heading: 'Acceptable use', paragraphs: ['Do not misuse the service, interfere with its operation, attempt unauthorized access, or submit information that you do not have permission to use. Shared-finance features do not establish another person’s consent or settle disagreements between participants.'] },
      { heading: 'Financial records, tools, and content', paragraphs: ['You remain responsible for the information you enter and for reviewing it for accuracy. Calculators produce estimates from the inputs supplied. Advisor responses, guides, examples, and projections are informational; read the Disclaimer before relying on them.', 'The Hisab Ki Kitab name, software, interface, and original guides are provided by their respective rights holders. You may use the service and its content for personal reference; do not republish or commercially exploit material without permission. Nothing in these terms transfers ownership of the financial records you enter.'] },
      { heading: 'Availability and changes', paragraphs: ['We may update, change, pause, or discontinue parts of the service as the product develops. The service may occasionally be unavailable, and no uninterrupted availability is promised. We may restrict access when needed to protect the service, its users, or its security. You can stop using the service and delete your account through Settings.'] },
      { heading: 'Responsibility and limits', paragraphs: ['Use the platform at your own discretion and verify important records and decisions independently. To the extent permitted by applicable law, Hisab Ki Kitab is not responsible for indirect loss or decisions made solely from an estimate, Advisor response, or guide. Nothing here excludes a responsibility that cannot legally be excluded.'] },
      { heading: 'Updates and contact', paragraphs: ['These terms may change as the product changes. The latest version and its review date appear on this page. Questions can be sent through the Contact page.'] },
    ],
  },
  disclaimer: {
    path: '/disclaimer',
    title: 'Financial Disclaimer',
    description: 'Understand the limits of Hisab Ki Kitab calculators, AI Advisor responses, articles, examples, and projections.',
    intro: 'Hisab Ki Kitab is a financial-management and educational tool that helps you organize and understand information you provide.',
    lastUpdated: LAST_UPDATED,
    sections: [
      { heading: 'Informational use', paragraphs: ['Calculators, AI Advisor outputs, articles, examples, summaries, and projections are for general informational and educational purposes. Results depend on the inputs and assumptions used, may be incomplete, and can differ from actual outcomes. Check figures before acting on them.'] },
      { heading: 'Not professional advice', paragraphs: ['Nothing on Hisab Ki Kitab is personalized financial, investment, tax, accounting, or legal advice. The platform does not know every fact relevant to your situation and does not replace a qualified professional or official source.'] },
      { heading: 'Important decisions', paragraphs: ['Before making an important tax, legal, investment, accounting, borrowing, or financial decision, verify current rules and figures with appropriate official sources or a qualified professional. You are responsible for decisions you make using the service.'] },
    ],
  },
};

export const trustPaths = Object.values(trustPages).map((page) => page.path);
export const trustPageFromPath = (path) => Object.values(trustPages).find((page) => page.path === path) || null;
