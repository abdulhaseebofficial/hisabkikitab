# Professional email proposal — 11 October 2026

Status: BLOCKED for implementation pending account access, delivery verification and approval of exact DNS records. No DNS, nameserver, forwarding alias, mailbox or SMTP account was changed.

Use only `hisabkikitab.com`, the working website domain supplied in the latest instruction. Confirm the same spelling in Namecheap Domain List before applying account changes. Target address: `support@hisabkikitab.com`. Destination: `abdulhaseebkashmiri158@gmail.com`.

## What is already verified

Public DNS uses Namecheap `dns1.registrar-servers.com` and `dns2.registrar-servers.com`, five Namecheap forwarding MX records and SPF `v=spf1 include:spf.efwd.registrar-servers.com ~all`. No DMARC record was found. Public DNS cannot tell whether the support alias exists or delivers successfully. Cloudflare is not the authoritative DNS provider in these observations; ownership of any Cloudflare account is unknown.

To verify the account configuration, open Namecheap → Domain List → Manage for the exact domain. Review Nameservers, Advanced DNS → Mail Settings, and Domain → Redirect Email. Record existing aliases and DNS records before edits. Do not change the mail mode or nameservers simply to inspect it. If the support alias exists, test it from a different external mailbox and inspect Gmail Spam as well as Inbox. A test from the same destination Gmail account can be misleading.

## Recommended architecture

Incoming: sender → existing Namecheap forwarding MX → support alias → existing Gmail inbox.

Outgoing: Gmail's Send mail as → authenticated SMTP2GO connection → recipient, using the verified support address.

This preserves the current authoritative DNS and avoids a Cloudflare nameserver migration. Namecheap forwarding is receive-only; outgoing SMTP is a separate service. [Namecheap forwarding documentation](https://www.namecheap.com/support/knowledgebase/article.aspx/308/2214/how-to-set-up-free-email-forwarding/).

SMTP2GO's free plan currently allows 1,000 messages/month and 200/day without a time limit. It permits five verified senders/domains and five days of activity history. Without verified domain authentication, a 25/hour restriction applies. Daily excess is queued; monthly excess is rejected rather than queued. This is practical for low-volume support, subject to account acceptance and successful tests; it is not unlimited or guaranteed delivery. [Free plan terms](https://support.smtp2go.com/hc/en-gb/articles/223087947-Free-Plan).

Signup requires an address at a domain you own rather than a Gmail address. First verify inbound support delivery, then use that working address for signup and complete any activation/account verification required. [Quick start](https://support.smtp2go.com/hc/en-gb/articles/12747932085145-Quick-Start-Guide).

## Setup sequence, with approval gates

1. Confirm the registered spelling and existing Namecheap mail configuration. If missing, propose adding only `support` forwarding to the Gmail destination. Obtain approval before saving account/routing changes.
2. Verify incoming delivery from another mailbox. Do not send test mail on the user's behalf without authorization.
3. Create an SMTP2GO free account using the working domain address. Account and identity verification remain user steps unless access and authorization are provided.
4. Add the domain to Verified Senders. Copy the exact generated authentication records into a review table with record type, host, value, existing record and proposed action. Do not invent DKIM selectors or targets.
5. Obtain separate approval before DNS changes. Preserve existing website records and incoming MX. Do not add a second SPF record; use the provider's verified configuration and combine SPF only if required. SMTP2GO domain authentication can use dedicated CNAME records; inspect the generated records first. Start DMARC monitoring only after SPF/DKIM alignment tests and approval of the reporting destination and policy. Enforcing quarantine/reject before verification can lose legitimate mail.
6. In Gmail Settings → Accounts and Import → Send mail as, add the support address. Use `mail.smtp2go.com`, port 587, TLS, and the SMTP user's credentials. Complete address verification and choose reply from the address the message was sent to. Keep credentials out of this repository and chat. [SMTP2GO Gmail instructions](https://www.smtp2go.com/setupguide/gmail/), [Google Send mail as documentation](https://support.google.com/mail/answer/22370).
7. Test incoming delivery, a reply and a new outgoing message with external recipients. Inspect message headers for SPF, DKIM and DMARC alignment and confirm the visible From/Reply-To address. Monitor bounces and quota. Disable unnecessary email open/click tracking for support correspondence if offered.

Approval of this architecture alone is not approval to change unknown DNS records. Exact generated records must be reviewed separately.

## Alternatives

| Option | Receive | Send/reply | Important restriction |
| --- | --- | --- | --- |
| Existing Namecheap forwarding + SMTP2GO | Free forwarding to Gmail | Free within SMTP2GO limits | Account acceptance, verified domain and approved authentication records required |
| Cloudflare Email Routing | Free inbound routing | Free sending only to verified destinations; arbitrary recipients require Workers Paid | Requires Cloudflare DNS onboarding and coordinated MX/nameserver changes; does not meet completely free general support replies by itself |
| Zoho Mail free plan | Separate domain mailbox | Webmail sending where free plan is available | Selected data centers; free plan excludes IMAP/POP/ActiveSync; not the same Gmail workflow |

Cloudflare's current Email Service does offer SMTP, but sending to arbitrary customer addresses requires a paid Workers plan. Its current paid allowance is 3,000 outgoing messages/month, then $0.35 per 1,000, in addition to the Workers plan. Free forwarding is not free general outbound mail. [Cloudflare pricing](https://developers.cloudflare.com/email-service/platform/pricing/), [routing setup](https://developers.cloudflare.com/email-service/get-started/route-emails/).

Zoho advertises a free domain plan with up to five users and 5 GB/user, subject to data-center availability. [Zoho pricing](https://www.zoho.com/mail/zohomail-pricing.html).

No receiving or sending capability has been marked COMPLETE because account configuration and end-to-end delivery have not been tested.
