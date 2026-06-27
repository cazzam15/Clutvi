# Clutvi 🚀

AI-powered tool suite for Instagram & TikTok creators. Six Claude-powered tools
(Caption Writer, Algo Analyzer, Post History Analyzer, Brain Dump to Content,
Comment Reply Assistant, Viral Inspiration) behind a monthly subscription.

## Stack

| Layer | Tech |
|---|---|
| Frontend | Static HTML/CSS/JS in `docs/`, deployed on GitHub Pages |
| Auth | Supabase email/password |
| AI backend | Supabase Edge Function `claude-proxy` → Anthropic API (key stays server-side) |
| Payments | Stripe Checkout subscription, synced via `stripe-webhook` |
| Database | Postgres `profiles` table (RLS), one row per user |

`prototype/clutvi-app.html` is the original standalone prototype (bring-your-own
API key, no auth). It still works on its own — just open it in a browser.

## How the gating works

1. User signs up / signs in (Supabase email/password). A DB trigger creates their `profiles` row.
2. Frontend reads `profiles.subscription_status`. Not `active`/`trialing` → paywall screen.
3. Subscribe button → `create-checkout` Edge Function → Stripe Checkout → redirect back with `?checkout=success`.
4. Stripe fires webhooks → `stripe-webhook` updates `subscription_status` in the profile.
5. Every tool call goes to `claude-proxy`, which re-checks auth + subscription **server-side** before calling Anthropic. The frontend paywall is just UX; the function is the real gate.

## Setup (one-time)

### 1. Supabase

1. Create a project at [database.new](https://database.new).
2. Copy the project URL and anon key (Settings → API) into `docs/js/config.js`.
3. Install the CLI and link: `supabase login`, then `supabase link --project-ref <your-ref>`.
4. Apply the migration: `supabase db push`
5. Set the function secrets:
   ```sh
   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
   supabase secrets set STRIPE_SECRET_KEY=sk_live_...      # or sk_test_... while testing
   supabase secrets set STRIPE_PRICE_ID=price_...
   supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...    # from step 2 of Stripe setup
   supabase secrets set SITE_URL=https://your-site.netlify.app
   ```
6. Deploy the functions:
   ```sh
   supabase functions deploy claude-proxy create-checkout customer-portal stripe-webhook
   ```
   (`stripe-webhook` gets `verify_jwt = false` automatically from `supabase/config.toml`.)

### 2. Stripe

1. Create a Product ("Clutvi Pro") with a monthly recurring Price — copy the `price_...` ID into the secrets above.
2. Add a webhook endpoint pointing to
   `https://<your-ref>.supabase.co/functions/v1/stripe-webhook`
   listening for: `checkout.session.completed`, `customer.subscription.updated`,
   `customer.subscription.deleted`. Copy its signing secret (`whsec_...`) into the secrets above.
3. Enable the **customer portal** (Settings → Billing → Customer portal) so "Manage billing" works.

### 3. Hosting (GitHub Pages)

1. Push this repo to GitHub.
2. Repo Settings → Pages → deploy from branch `main`, folder `/docs`.
   Site goes live at `https://<user>.github.io/Clutvi/` (landing page; the app is at `/app`).
3. Put the final site URL into the `SITE_URL` secret (step 1.5) and into
   Supabase Auth → URL Configuration → Site URL (so confirmation emails link correctly).

(`netlify.toml` is kept in the repo — importing the repo into Netlify also works,
no build command needed.)

### Testing the payment flow

Use Stripe test mode keys and card `4242 4242 4242 4242`. After checkout the app
polls the profile for up to ~20s while the webhook lands.

## Roadmap

- [ ] Move content history + viral library from localStorage into per-user Postgres tables
- [ ] Usage metering / fair-use limits on `claude-proxy`

- [ ] Custom domain
