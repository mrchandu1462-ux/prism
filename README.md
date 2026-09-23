# PRISM

> **Wallet-native look-through risk and portfolio intelligence engine for tokenized stocks and ETFs on Solana.**

---

## The Problem

As tokenized equities (such as xStocks and synthetic ETFs) grow on Solana, traditional crypto wallets evaluate portfolio risk solely at the **token level**.

A wallet holding:
- A direct tokenized stock (e.g. `NVDAx`)
- A tokenized index ETF (e.g. `SPYx` or `QQQx`)

appears diversified across multiple separate token assets in standard wallet interfaces. However, because index ETFs hold underlying equities like NVIDIA as top constituents, the user's **true economic exposure** to that company is significantly higher than what the direct token holding indicates. Standard wallet views underestimate concentration risk, leaving investors unaware of hidden portfolio overlap.

---

## The Solution

PRISM provides end-to-end look-through portfolio intelligence:

1. **Connects to a Solana Wallet**: Integrates with standard Solana wallets (Phantom, Backpack, Solflare) via `@solana/wallet-adapter`.
2. **Discovers SPL and Token-2022 Accounts**: Concurrent on-chain scanning across both the legacy SPL Token Program and the Token-2022 Program.
3. **Identifies Supported Tokenized Assets**: Resolves token mints against verified base configurations and dynamically discovered token registries.
4. **Retrieves Mark-Price and Metadata through Tessera**: Ingests authoritative token metadata and mark prices from Tessera where applicable.
5. **Performs Deterministic Look-Through ETF Decomposition**: Deconstructs tokenized ETFs into constituent company weights based on official regulatory basket data.
6. **Aggregates Direct + Underlying Exposure**: Calculates the exact dollar value and portfolio percentage for each underlying company across direct and ETF-derived holdings.
7. **Compares Concentration Against Target**: Evaluates portfolio concentration against a user-configurable concentration limit.
8. **Produces Rebalance Recommendations**: Computes the exact surplus token amount needed to rebalance over-concentrated positions.
9. **Integrates Jupiter Rebalance Flow**: Prepares swap parameters to rebalance excess equity exposure back into USDC via Jupiter.
10. **Provides On-Chain Scanner Diagnostics**: Surfaces full diagnostic provenance (program ID, mint address, raw balance, validation status) for every detected account.

---

## Why PRISM Is Different: "What You Hold" vs. "Look Through"

Standard portfolio trackers only show **"What You Hold"**—the literal token mints in your wallet account.

PRISM adds **"Look Through"**—decomposing composite assets into their true underlying corporate constituents.

### Example:
- **What You Hold**: 
  - `$5,000 SPYx` (SPDR S&P 500 ETF)
  - `$2,000 NVDAx` (Direct NVIDIA Stock)
  - `$3,000 USDC` (Settlement Stablecoin)
  - **Direct View**: NVIDIA appears to be **20.0%** ($2,000 / $10,000) of the portfolio.
- **Look Through**: 
  - `SPYx` contains **6.85%** NVIDIA in its constituent basket ($342.50 derived exposure).
  - Direct `NVDAx` contributes **$2,000.00**.
  - **True NVIDIA Exposure**: **$2,342.50 (23.425%)** of the portfolio.

PRISM reveals the hidden $342.50 exposure that standard wallet views miss.

---

## Architecture

```mermaid
flowchart TD
    Wallet[Solana Wallet\nPhantom / Backpack / Solflare] --> WalletAdapter[Wallet Adapter React]
    WalletAdapter --> Scanner[PRISM Portfolio Scanner]
    Scanner -->|SPL Token Program| RpcProxy[/api/rpc Proxy]
    Scanner -->|Token-2022 Program| RpcProxy
    RpcProxy --> SolanaRpc[Server-Side Solana RPC\nSOLANA_RPC_URL]
    SolanaRpc --> Adapter[Portfolio Adapter]
    Adapter -->|Supported Asset Whitelist| Registry[Asset Registry]
    Adapter -->|Metadata & Mark Prices| Tessera[Tessera Integration]
    Registry --> ExposureEngine[Look-Through Exposure Engine]
    Tessera --> ExposureEngine
    ExposureEngine --> RiskEngine[Risk / Concentration Engine]
    RiskEngine --> JupiterFlow[Jupiter Rebalance Flow]
    RiskEngine --> Dashboard[PRISM Dashboard UI]
    JupiterFlow --> Dashboard
```

---

## Core Components

The PRISM codebase is organized into modular, strictly typed components:

- **Solana Scanner** ([`src/lib/solana/scanner.ts`](file:///c:/Users/mrcha/prism/src/lib/solana/scanner.ts)): Concurrent dual-program scanner for SPL Token and Token-2022 accounts with strict error propagation.
- **RPC Proxy** ([`src/app/api/rpc/route.ts`](file:///c:/Users/mrcha/prism/src/app/api/rpc/route.ts) & [`src/lib/solana/connection.ts`](file:///c:/Users/mrcha/prism/src/lib/solana/connection.ts)): Secure server-side JSON-RPC 2.0 proxy preventing browser WAF 403 blocks and keeping private RPC keys server-side.
- **Wallet Integration** ([`src/components/wallet/WalletContextProvider.tsx`](file:///c:/Users/mrcha/prism/src/components/wallet/WalletContextProvider.tsx), [`src/components/wallet/PrismWalletButton.tsx`](file:///c:/Users/mrcha/prism/src/components/wallet/PrismWalletButton.tsx), [`src/hooks/usePrismPortfolio.ts`](file:///c:/Users/mrcha/prism/src/hooks/usePrismPortfolio.ts)): React hook managing on-chain discovery, pricing resolution, exposure calculation, and reactive state.
- **Portfolio Adapter** ([`src/lib/solana/adapter.ts`](file:///c:/Users/mrcha/prism/src/lib/solana/adapter.ts)): Transforms raw scanned token accounts into verified holdings with diagnostic categorization (`ACCEPTED`, `IGNORED_NOT_WHITELISTED`, `IGNORED_UNVERIFIED_MINT`).
- **Tessera Integration** ([`src/lib/tessera/client.ts`](file:///c:/Users/mrcha/prism/src/lib/tessera/client.ts), [`src/lib/tessera/adapter.ts`](file:///c:/Users/mrcha/prism/src/lib/tessera/adapter.ts), [`src/app/api/tessera/token-details/route.ts`](file:///c:/Users/mrcha/prism/src/app/api/tessera/token-details/route.ts)): Authoritative client querying live token details and mark prices from Tessera, paired with on-chain mint validation ([`src/lib/solana/mintValidator.ts`](file:///c:/Users/mrcha/prism/src/lib/solana/mintValidator.ts)).
- **Exposure & Risk Engine** ([`src/lib/engine/exposure.ts`](file:///c:/Users/mrcha/prism/src/lib/engine/exposure.ts), [`src/lib/engine/concentration.ts`](file:///c:/Users/mrcha/prism/src/lib/engine/concentration.ts), [`src/lib/engine/rebalance.ts`](file:///c:/Users/mrcha/prism/src/lib/engine/rebalance.ts), [`src/lib/etf/registry.ts`](file:///c:/Users/mrcha/prism/src/lib/etf/registry.ts)): Deterministic mathematical solvers for look-through aggregation, concentration violation detection, and rebalance calculations.
- **Jupiter Integration** ([`src/lib/jupiter/client.ts`](file:///c:/Users/mrcha/prism/src/lib/jupiter/client.ts), [`src/components/dashboard/RebalanceModal.tsx`](file:///c:/Users/mrcha/prism/src/components/dashboard/RebalanceModal.tsx)): Formulates exact Jupiter v1 swap parameters to execute rebalances.
- **Dashboard UI** ([`src/app/page.tsx`](file:///c:/Users/mrcha/prism/src/app/page.tsx), [`src/components/dashboard/LookThroughToggle.tsx`](file:///c:/Users/mrcha/prism/src/components/dashboard/LookThroughToggle.tsx), [`src/components/dashboard/TokenHoldingsList.tsx`](file:///c:/Users/mrcha/prism/src/components/dashboard/TokenHoldingsList.tsx), [`src/components/dashboard/UnderlyingExposureList.tsx`](file:///c:/Users/mrcha/prism/src/components/dashboard/UnderlyingExposureList.tsx), [`src/components/dashboard/ConcentrationControls.tsx`](file:///c:/Users/mrcha/prism/src/components/dashboard/ConcentrationControls.tsx), [`src/components/dashboard/SectorBreakdown.tsx`](file:///c:/Users/mrcha/prism/src/components/dashboard/SectorBreakdown.tsx), [`src/components/dashboard/DiagnosticsView.tsx`](file:///c:/Users/mrcha/prism/src/components/dashboard/DiagnosticsView.tsx)): High-performance interface for switching between views, configuring limits, and inspecting diagnostics.

---

## Token Support & Provenance

### Statically Verified Base Assets

| Asset | Mint Address | Program | Purpose |
| :--- | :--- | :--- | :--- |
| **USDC** | `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` | SPL Token Program | Settlement Stablecoin |
| **NVDAx** | `Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh` | Token-2022 Program | Tokenized NVIDIA Stock |
| **SPYx** | `XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W` | Token-2022 Program | Tokenized SPDR S&P 500 ETF Basket |
| **QQQx** | `Xs8S1uUs1zvS2p7iwtsG3b6fkhpvmwz4GYU3gWAmWHZ` | Token-2022 Program | Tokenized Invesco QQQ ETF Basket |

### Dynamically Discovered Tessera Assets
In addition to statically verified base assets, PRISM queries the Tessera public API (`/v1/public/token-details`) at runtime. Discovered assets (such as `T-OpenAI`, `T-Kalshi`, and `T-SpaceX`) are validated on-chain via `validateSolanaMints()` before being admitted into the registry with their authoritative mark prices.

---

## Security & RPC Architecture

1. **Browser Runtime Always Uses `/api/rpc`**:
   The browser client connects strictly to the same-origin Next.js proxy route `/api/rpc`.
2. **Zero Client Secret Exposure**:
   No upstream private RPC URLs or API keys (Helius, QuickNode, Alchemy) are exposed to client-side bundles or `NEXT_PUBLIC_*` variables.
3. **Server-Side Upstream Resolution**:
   The proxy resolves the upstream RPC exclusively from `process.env.SOLANA_RPC_URL` (with fallback to `https://api.mainnet-beta.solana.com`).
4. **Cloudflare WAF Protection**:
   Browser `Origin` headers that cause public Solana RPC nodes to return `HTTP 403 Access forbidden` are eliminated by the server-side proxy.

---

## Error Transparency

PRISM enforces strict separation between genuine wallet state and network/RPC errors:

- **Legitimate Empty Wallet**: Returns `{ accounts: [] }` with `$0.00` balance and clear empty state indicators.
- **RPC / Network Failure**: Exceptions (such as timeouts, 502/504 gateway errors, or 429 rate limits) are caught and surfaced directly to the UI via the **Solana RPC Notice** banner.
- **Diagnostics Drawer**: Every detected account displays an explicit diagnostic badge (`ACCEPTED`, `IGNORED_NOT_WHITELISTED`, `IGNORED_UNVERIFIED_MINT`) with the exact technical reason.

---

## Testing & Verification Status

```bash
# Unit & Integration Tests (Vitest)
npm test
# Result: 10 test files passed (79 / 79 tests passed)

# TypeScript Validation
npx tsc --noEmit
# Result: 0 errors (Clean exit code 0)

# Next.js Production Build
npm run build
# Result: Compiled successfully (Turbopack), all static & dynamic routes generated
```

The 11 test suites cover:
- Look-through math engine and ETF decomposition
- Multi-asset concentration evaluation and Jupiter rebalance formulation
- Dual-program token account scanner & RPC error propagation
- Dynamic Tessera registry client and cache TTL behavior
- Demo mode deterministic isolation and math consistency
- On-chain mint validation and adversarial edge cases

---

## 60–90 Second Judge Demo Walkthrough

1. **Connect Wallet or Try Demo**: Click **Connect Wallet** for live on-chain discovery, or click **Try Demo Portfolio** to explore with a simulated $57k tech & ETF basket.
2. **Show "What You Hold"**: Inspect direct token balances ($10k USDC, $25k SPYx, $16k QQQx, $6k NVDAx).
3. **Switch to "Look Through"**: Toggle the view mode to reveal true underlying company allocations.
4. **Show Hidden Underlying Exposure**: Observe how SPYx and QQQx constituent weights increase true NVIDIA exposure from $6,000 (10.5%) to **$9,072.50 (15.92%)**.
5. **Adjust Concentration Target**: Move the target concentration slider down to 10% to test dynamic risk thresholding.
6. **Show Risk Warning**: Observe the highlighted concentration alert indicating exact excess exposure (+$3,372.50).
7. **Open Rebalance Flow**: Click **Rebalance** to view the calculated Jupiter swap recommendation (sell 28.1041 NVDAx → USDC).
8. **Show Scanner Diagnostics**: Expand the **On-Chain Scanner Diagnostics** tray to verify token accounts, mints, and program IDs.

---

## STOCKLANA Pitch: Why PRISM?

- **Tokenized Equity Transparency**: Brings institutional-grade portfolio look-through to decentralized finance.
- **Eliminates Hidden Concentration**: Prevents investors from taking unintended single-stock risks across composite tokens.
- **Deterministic Math Engine**: 100% pure TypeScript solvers with zero synthetic data fabrication.
- **Solana-Native Architecture**: Purpose-built for Token-2022, SPL tokens, and the high-speed Solana ecosystem.
- **Actionable Rebalance Workflow**: Moves seamlessly from risk detection to Jupiter swap execution.

---

## Tech Stack

- **Framework**: Next.js 16.3.5 (App Router, Turbopack)
- **UI / Styling**: React 19, Tailwind CSS, Lucide React, clsx, tailwind-merge
- **Solana Core**: `@solana/web3.js` 1.99.0, `@solana/spl-token` 0.4.15
- **Wallet Standard**: `@solana/wallet-adapter-react`, `@solana/wallet-adapter-react-ui`, `@solana/wallet-adapter-base`
- **Testing & Tooling**: Vitest 5.0.1, TypeScript 5, ESLint 9

---

## Local Development

```bash
# 1. Install dependencies
npm install

# 2. Run local development server
npm run dev

# 3. Run test suite
npm test

# 4. Run TypeScript type check
npx tsc --noEmit

# 5. Build for production
npm run build
```

---

## Production Architecture

- **Deployment**: Next.js hosted on Vercel.
- **API Routes**: Dynamic serverless route handlers (`/api/rpc` and `/api/tessera/token-details`).
- **RPC Configuration**: Configured via server-side environment variable `SOLANA_RPC_URL` in Vercel project settings.
