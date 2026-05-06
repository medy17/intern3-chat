# Email Setup

This repo already contains an outbound email utility in [src/lib/email.ts](./src/lib/email.ts).
The clean setup for the current product is:

- `Resend` for outbound transactional mail from the app
- `Cloudflare Email Routing` for inbound aliases like `support@silkchat.dev`
- no IMAP mailbox hosting unless or until you actually need it

That keeps cost low and avoids running a real mailbox stack too early.

## What Exists Today

- `src/lib/email.ts` supports `resend`, `ses`, and a local mock provider.
- The default provider is `resend`.
- Current templates cover:
  - sign-in OTP
  - email verification
  - password reset
- These helpers are present, but they are not currently wired into the auth flow.
- If you want to start using email now, the most practical first use is a welcome email or account-notification emails.

## Environment Variables

These variables are read by the app server, not Convex:

```bash
EMAIL_PROVIDER=resend
EMAIL_FROM=noreply@silkchat.dev
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxxxxxxxx
```

Notes:

- `EMAIL_PROVIDER` defaults to `resend` in code.
- `EMAIL_FROM` defaults to `noreply@intern3.chat` in code if unset, but you should set it explicitly.
- `RESEND_API_KEY` is required when `EMAIL_PROVIDER=resend`.

## Recommended Architecture

### Outbound

Use `Resend` for:

- welcome emails
- account deletion confirmation emails
- export-ready notifications
- future 2FA or verification flows

### Inbound

Use `Cloudflare Email Routing` for:

- `support@silkchat.dev`
- `hello@silkchat.dev`
- `legal@silkchat.dev`
- `privacy@silkchat.dev`

Cloudflare Email Routing forwards mail to an existing inbox. It is not IMAP hosting.

## Resend Setup

### 1. Create a Resend account

- Go to `https://resend.com`
- Create an API key

### 2. Add your sending domain

- In Resend, add `silkchat.dev` as a domain
- Resend will give you DNS records to add, usually including SPF and DKIM records

### 3. Configure DNS

Add the exact DNS records Resend gives you in your DNS provider.
If `silkchat.dev` is on Cloudflare DNS, add them there.

Important:

- If Cloudflare proxies are available for the relevant records, keep them `DNS only`
- Email auth records should not be orange-cloud proxied

### 4. Choose a sender address

Recommended:

```bash
EMAIL_FROM=noreply@silkchat.dev
```

You can later also use:

- `welcome@silkchat.dev`
- `support@silkchat.dev`
- `legal@silkchat.dev`

As long as the domain is verified and the sender is allowed by your Resend setup.

### 5. Set app environment variables

In local `.env.local`:

```bash
EMAIL_PROVIDER=resend
EMAIL_FROM=noreply@silkchat.dev
RESEND_API_KEY=re_your_real_key_here
```

In Vercel production env:

- `EMAIL_PROVIDER`
- `EMAIL_FROM`
- `RESEND_API_KEY`

### 6. Verify the mailer path

The current send path is:

- config load in [src/lib/email.ts](./src/lib/email.ts)
- `sendWithResend()` in [src/lib/email.ts](./src/lib/email.ts)
- templates in [src/lib/email-templates.tsx](./src/lib/email-templates.tsx)

Today, the mail utility exists but is not yet hooked into live auth actions.

## Cloudflare Email Routing Setup

### 1. Put the domain on Cloudflare DNS

If `silkchat.dev` is already using Cloudflare DNS, use the existing zone.

### 2. Open Email Routing

In Cloudflare dashboard:

- select `silkchat.dev`
- go to `Email` or `Email Routing`

### 3. Enable routing

Cloudflare will ask you to add or confirm MX and related records.
Accept the generated routing records.

### 4. Add destination inboxes

Pick a real inbox you already control, for example:

- your Gmail
- your personal custom mailbox
- a team inbox

Then create routes such as:

- `support@silkchat.dev` -> your main inbox
- `hello@silkchat.dev` -> your main inbox
- `legal@silkchat.dev` -> your main inbox
- `privacy@silkchat.dev` -> your main inbox

### 5. Optional catch-all

You can add a catch-all route if you want:

- `*@silkchat.dev` -> your inbox

Only do this if you are prepared for the spam load.
For most small apps, explicit aliases are cleaner.

## Recommended Address Layout

- `noreply@silkchat.dev`: outbound app mail via Resend
- `support@silkchat.dev`: inbound support via Cloudflare Email Routing
- `hello@silkchat.dev`: general inbound contact
- `legal@silkchat.dev`: legal notices
- `privacy@silkchat.dev`: privacy requests

You do not need these to all be separate inboxes yet.
Cloudflare can forward all of them to the same destination mailbox.

## Testing Plan

### DNS and provider validation

- Confirm Resend domain status becomes verified
- Confirm Cloudflare Email Routing is active

### Outbound

Once a call site is added for the existing mailer:

- send a test email from a server-side route or script
- confirm delivery in inbox
- confirm SPF/DKIM alignment in the received message headers

### Inbound

- send mail to `support@silkchat.dev`
- confirm forwarding reaches your destination inbox
- reply manually from your real mailbox if needed

Note:

- Cloudflare Email Routing handles receiving and forwarding
- Resend handles sending
- replying "from the alias" may need mailbox-side configuration depending on your destination inbox

## Common Mistakes

- Verifying the domain in Resend but forgetting to set `EMAIL_FROM`
- Using a sender address on a domain that Resend has not verified
- Orange-cloud proxying email DNS records in Cloudflare
- Expecting Cloudflare Email Routing to provide IMAP mailboxes
- Expecting the current app to send auth emails automatically when those hooks are not yet wired

## Practical Next Step for This Repo

If you want the first useful email feature, I’d recommend:

1. finish the `Resend + Cloudflare` DNS and env setup
2. add a simple welcome email helper
3. trigger it on first successful OAuth signup

That uses the existing mail stack without forcing a password-reset or OTP flow you do not currently need.
