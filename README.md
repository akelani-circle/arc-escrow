# Arc Escrow

Automate escrow-backed freelance agreements with AI-powered work validation using USDC on Arc testnet. This sample application uses Next.js, Supabase, Circle Developer Controlled Wallets, and OpenAI to demonstrate an end-to-end escrow workflow — from contract creation and deposit, through AI-validated deliverable submission, to fund release or refund.

<img width="830" height="467" alt="Escrow agreement dashboard" src="public/screenshot.png" />

> [!WARNING]
> **The onramp defaults to sandbox, and leaving it that way is deliberate.**
> `ONRAMP_API_BASE_URL` and `NEXT_PUBLIC_ONRAMP_WIDGET_BASE_URL` are set to
> Circle's sandbox endpoints in `.env.example`. If either is unset, empty, or
> removed, the app falls back to Circle's production endpoints on mainnet, where
> **every purchase charges a real payment method** — and delivers to a chain the
> Arc Testnet escrow wallet does not exist on. Setting only one of them is
> refused at startup rather than run in a broken half-state.

## Table of Contents

- [Features](#features)
- [Prerequisites](#prerequisites)
- [Getting Started](#getting-started)
- [How It Works](#how-it-works)
- [Upgrading](#upgrading)
- [Environment Variables](#environment-variables)
- [User Accounts](#user-accounts)
- [Available Scripts](#available-scripts)
- [Testing](#testing)
- [Security & Usage Model](#security--usage-model)

## Features

- **Sign up and sign in** (`/sign-up`, `/sign-in`) — Email and password accounts backed by Supabase Auth, with password reset and optional Google sign-in. Each new user gets a Circle wallet on Arc Testnet.
- **Account balance** (`/dashboard`) — Your wallet's USDC balance, updated in real time, with wallet details in `WalletInformationDialog`.
- **Add money** (`AddMoneyButton`) — Buy USDC with fiat straight into your wallet through Circle's hosted onramp. Sandbox only, see the warning above.
- **Create agreement** (`CreateAgreementPage`) — Upload a PDF or DOCX contract and pick a beneficiary. OpenAI pulls out the amounts and tasks (`/api/contracts/analyze`).
- **Escrow agreements** (`EscrowAgreements`) — Deploy the escrow contract, deposit USDC, submit work for AI validation (`/api/contracts/validate-work`), and release or refund the funds.
- **Transactions** (`Transactions`) — Your wallet's transaction history, synced from Circle, with a detail page at `/dashboard/transaction/[id]`.

## Prerequisites

- **Node.js v22+** — Install via [nvm](https://github.com/nvm-sh/nvm)
- **Docker Desktop** — Runs local Supabase. [Install Docker Desktop](https://www.docker.com/products/docker-desktop/)
- **[ngrok](https://ngrok.com/)** — For local webhook testing
- Circle Developer Controlled Wallets **[API key](https://console.circle.com/signin)** and **[Entity Secret](https://developers.circle.com/wallets/dev-controlled/register-entity-secret)**
- **[OpenAI API key](https://platform.openai.com/api-keys)** — Used for AI-powered work validation

## Getting Started

1. Clone the repository and install dependencies:

   ```bash
   git clone git@github.com:akelani-circle/arc-escrow.git
   cd arc-escrow
   npm install
   ```

2. Set up environment variables:

   ```bash
   cp .env.example .env.local
   ```

   Then edit `.env.local` and fill in all required values (see [Environment Variables](#environment-variables) section below). Leave `NEXT_PUBLIC_AGENT_WALLET_ID` and `NEXT_PUBLIC_AGENT_WALLET_ADDRESS` blank — they will be auto-generated in the next step.

3. Generate the agent wallet:

   ```bash
   npm run generate-wallet
   ```

   This creates a Circle developer-controlled wallet on Arc Testnet and writes the wallet ID and address into your `.env.local`.

4. Set up the database (requires Docker Desktop installed and running):

   ```bash
   npm run db:start
   ```

   This starts Supabase in Docker and applies the migrations in `supabase/migrations`. The output shows the Supabase URL and API keys needed for your `.env.local`; run `npm run db:status` to see them again.

5. Start the development server:

   ```bash
   npm run dev
   ```

   The app will be available at `http://localhost:3000`.

6. Set up Circle Webhooks (for local development):

   In a separate terminal, expose your local server:

   ```bash
   ngrok http 3000
   ```

   Copy the HTTPS URL from ngrok and configure a webhook in the Circle Console:
   - Navigate to [Circle Console → Webhooks](https://console.circle.com/webhooks)
   - Add a new webhook endpoint: `https://your-ngrok-url.ngrok.io/api/webhooks/circle`
   - Keep ngrok running while developing to receive webhook events

## How It Works

- Built with [Next.js](https://nextjs.org/) and [Supabase](https://supabase.com/)
- Uses [Circle Developer Controlled Wallets](https://developers.circle.com/wallets/dev-controlled) for USDC escrow transactions on Arc testnet
- Smart contracts (EIP-712 Refund Protocol) deployed and managed via `@circle-fin/smart-contract-platform`
- [OpenAI](https://platform.openai.com/) validates submitted work deliverables against agreement criteria using vision models
- Webhook signature verification ensures secure transaction notifications
- Agent wallet automatically initialized via the `generate-wallet` script
- **Add money** opens Circle's hosted onramp in a popup via [Onramp Kit](https://developers.circle.com/), scoped to USDC on Arc. The session is minted server-side against the signed-in user's own wallet, so the browser never names the destination address
- Real-time UI updates powered by Supabase Realtime subscriptions

## Upgrading

Changes that require action on an existing deployment:

- **Apply the new migration** (`npm run db:start` locally, `npm run supabase -- db push` on a hosted project). It tightens what signed-in users can write:
  - Only the **depositor** can edit an agreement's `terms`, and only before the contract is deployed. Before this, the beneficiary could rewrite the tasks the AI validates against, then "validate" any image to release the funds.
  - Nobody can set an agreement's `status` or `circle_contract_id` directly, and a new agreement must start `INITIATED`. Only server routes change them, after checking the caller.
  - A locked agreement cannot be deleted by a user (deleting it would orphan the escrowed funds).
  - Users can no longer rewrite their own `transactions`, or their profile `email` (it identifies people in the recipient picker).
- **API routes now check who is calling.** Before, `/api/wallet/*`, `/api/contracts/escrow` and `/api/contracts/analyze` had no authentication at all, so anyone could read any wallet's balance, deploy contracts from the agent wallet, or spend your OpenAI credit. All of them now require a signed-in user, and wallet reads must be for your own wallet.
- **Each money-moving action is limited to the right party**, and to the right agreement status:

  | Action | Who | Agreement must be |
  | --- | --- | --- |
  | Deploy the contract | depositor | `INITIATED` |
  | Approve USDC | depositor | `OPEN` |
  | Deposit | depositor | `OPEN` or `PENDING` |
  | Submit work (releases funds) | beneficiary | `LOCKED` |
  | Refund | beneficiary | `LOCKED` |

  Previously the refund route would run from the beneficiary's wallet for either party, so a depositor could force a refund out from under the escrow.
- **A failed refund now returns the agreement to `LOCKED`** (it was `OPEN`, which invited a second deposit while the first was still locked).
- **The password-reset email** now lands on the reset form (the link carried `redirect_to` but the callback reads `next`).
- Signed-in requests to your own API from the browser now use relative URLs.

## Environment Variables

Copy `.env.example` to `.env.local` and fill in the required values:

```bash
# Deployment URL
VERCEL_URL=http://localhost:3000
NEXT_PUBLIC_VERCEL_URL=http://localhost:3000

# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SECRET_KEY=

# Agent Wallet (auto-generated by npm run generate-wallet)
NEXT_PUBLIC_AGENT_WALLET_ID=
NEXT_PUBLIC_AGENT_WALLET_ADDRESS=

# Circle
CIRCLE_API_KEY=
CIRCLE_ENTITY_SECRET=

# OpenAI
OPENAI_API_KEY=

# Circle Onramp Kit (sandbox)
ONRAMP_API_BASE_URL=https://api-test.circle.com
NEXT_PUBLIC_ONRAMP_WIDGET_BASE_URL=https://onramp-sandbox.arc.io

# Google sign-in (optional)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
```

| Variable | Scope | Purpose |
| --- | --- | --- |
| `VERCEL_URL` | Server-side | Base URL of the deployment (e.g., `http://localhost:3000`). |
| `NEXT_PUBLIC_VERCEL_URL` | Public | Public-facing base URL for client-side usage. |
| `NEXT_PUBLIC_SUPABASE_URL` | Public | Supabase project URL. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Public | Supabase publishable key. |
| `SUPABASE_SECRET_KEY` | Server-side | Supabase secret key. Bypasses row level security, so it is only used for wallet creation and Circle webhooks. |
| `NEXT_PUBLIC_AGENT_WALLET_ID` | Public | Circle wallet ID for the escrow agent. Auto-generated. |
| `NEXT_PUBLIC_AGENT_WALLET_ADDRESS` | Public | Wallet address for the escrow agent. Auto-generated. |
| `CIRCLE_API_KEY` | Server-side | Circle API key for wallet, contract, and onramp operations. Must match the environment the onramp base URLs point at. |
| `CIRCLE_ENTITY_SECRET` | Server-side | Circle entity secret for signing transactions. |
| `OPENAI_API_KEY` | Server-side | OpenAI API key for AI-powered work validation. |
| `ONRAMP_API_BASE_URL` | Server-side | Circle API endpoint for the onramp. `https://api-test.circle.com` for sandbox. Unset means production. |
| `NEXT_PUBLIC_ONRAMP_WIDGET_BASE_URL` | Public | Hosted onramp widget endpoint. `https://onramp-sandbox.arc.io` for sandbox. Unset means production. |
| `GOOGLE_CLIENT_ID` | Supabase | Optional. Google OAuth client ID. Only read by local Supabase, and only after you enable `[auth.external.google]` in `supabase/config.toml`. |
| `GOOGLE_CLIENT_SECRET` | Supabase | Optional. Google OAuth client secret, same as above. |

## User Accounts

### Default Account

On first visit, sign up with any email and password. The first user created can act as both a depositor (client) and a beneficiary (freelancer) across different agreements.

### Signup Rate Limits

Supabase limits email signups to **2 per hour** by default (unless custom SMTP is configured). If you hit an "email rate limit exceeded" error during testing:

Email verification is handled by the built-in [local mail server](http://127.0.0.1:54324) — check it to confirm signups. The rate limit can be adjusted in `supabase/config.toml` under `[auth.rate_limit]`.

## Available Scripts

- `npm run dev` — Start the Next.js development server
- `npm run build` — Create a production build
- `npm run start` — Start the production server
- `npm run lint` — Run ESLint
- `npm test` — Run the unit tests (no services needed)
- `npm run test:integration` — Run database tests against the local Supabase (`npm run db:start` first)
- `npm run generate-wallet` — Create the agent wallet and write its ID and address to `.env.local`
- `npm run supabase` — Run the Supabase CLI (e.g. `npm run supabase -- status`)
- `npm run db:start` — Start local Supabase
- `npm run db:stop` — Stop local Supabase
- `npm run db:status` — Show local Supabase URLs and keys
- `npm run db:reset` — Reset the local database and re-run migrations
- `npm run db:migration` — Create a new migration (e.g. `npm run db:migration -- add_column`)

## Testing

- `npm test` runs the unit tests in `tests/unit`. They mock Supabase, Circle and OpenAI, so they need no credentials or Docker. They cover who may call each route (signed-out, wrong party, stranger, right party), the deploy claim, and the webhook, including real signature verification.
- `npm run test:integration` runs `tests/integration` against the **local** Supabase stack: the row-level-security rules, exercised with real users and real sessions. It reads connection settings from `.env.local`, and creates and deletes its own users.

## Security & Usage Model

This sample application:
- Assumes testnet usage only
- Handles secrets via environment variables
- Verifies webhook signatures for security
- Checks the caller's role before any action that moves funds
- Is not intended for production use without modification

Known limitations to address before any production use:
- **The recipient picker exposes users to each other.** Any signed-in user can list every other user's name, email and wallet address (needed to choose a recipient). Production code should look recipients up by exact email on the server instead of loading everyone.
- **Wallet details are readable by every signed-in user**, including Circle wallet ids and cached balances. Wallet reads through the API are limited to your own wallet, but the ids themselves are not secret.
- **AI validation is the escrow's only judge of the work.** An image that convinces the model releases the funds. Treat it as a demo of the flow, not as dispute resolution; `dispute_resolutions` is not used yet.
- **The agent wallet id is public** (`NEXT_PUBLIC_AGENT_WALLET_ID`). The id is not a credential, but the wallet pays gas for every deployment, so keep it funded modestly.

See `SECURITY.md` for vulnerability reporting guidelines. Please report issues privately via Circle's bug bounty program.
