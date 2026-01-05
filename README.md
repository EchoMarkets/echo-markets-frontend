# Echo Markets

> Bitcoin Prediction Markets powered by Charms Protocol ⚡

A decentralized prediction market platform built on Bitcoin Testnet4, powered by the Charms protocol. Trade on future outcomes using Bitcoin-native smart contracts with zero-knowledge proofs.

**Built for:** [The BOS Hackathon](https://www.encodeclub.com/programmes/enchanting-utxo-bitcoin-smart-contracts-by-bitcoinos) - Building Bitcoin Smart Contracts with the BitcoinOS Stack at Encode Club

---

## 📦 Repositories

| Repo                                                                          | Description                   |
| ----------------------------------------------------------------------------- | ----------------------------- |
| [echo-markets](https://github.com/EchoMarkets/echo-markets)                   | Charms smart contracts (Rust) |
| [echo-markets-frontend](https://github.com/EchoMarkets/echo-markets-frontend) | Web application (this repo)   |

## 🎯 Features

### Core Functionality

- **Create Markets** — Launch prediction markets with custom questions, deadlines, and fees
- **Mint Shares** — Deposit BTC to receive YES + NO tokens
- **Burn Shares** — Burn equal YES + NO to recover BTC (before resolution)
- **P2P Trading** — Swap YES tokens for NO (and vice versa)
- **Portfolio Tracking** — Real-time P&L, position values, and transaction history
- **Wallet Integration** — Full BIP39/BIP86 Taproot wallet with Schnorr signatures

### Technical Highlights

- **Zero-Knowledge Proofs** — Private, verifiable transactions via Charms v8
- **Bitcoin Native** — Built on Bitcoin Testnet4, no sidechains
- **Taproot Wallets** — BIP86 derivation with Schnorr signatures
- **Transaction Polling** — Automatic confirmation tracking
- **Modern Stack** — Next.js 15, React 19, TypeScript, Tailwind CSS v4

---

## 🚀 Quick Start

### Prerequisites

- Node.js 20+ and npm
- Bitcoin Testnet4 coins ([mempool faucet](https://mempool.space/testnet4/faucet))
- Charms CLI (for contract compilation)

### Installation

```bash
# Clone the repository
git clone https://github.com/EchoMarkets/echo-markets-frontend.git
cd echo-markets-frontend

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env.local
```

### Environment Variables

Create a `.env.local` file:

```bash
# Charms Prover API
CHARMS_PROVER_URL=https://v8.charms.dev/spells/prove

# Mempool API (testnet4)
MEMPOOL_API=https://mempool.space/testnet4/api

# Contract Verification Key
# Generate with: charms app vk --wasm ./contracts/echo-markets.wasm
APP_VK=your_verification_key_here

# Path to compiled contract
APP_WASM_PATH=./contracts/echo-markets.wasm
```

### Development

```bash
npm run dev
# Open http://localhost:3000
```

### Production Build

```bash
npm run build
npm start
```

---

## 📁 Project Structure

```
echo-markets-frontend/
├── app/
│   ├── api/charms/           # Charms API routes
│   │   ├── broadcast/        # Transaction broadcasting
│   │   ├── cast/             # Prove + sign + broadcast
│   │   └── prove/            # ZK proof generation
│   ├── create/               # 4-step market creation wizard
│   ├── market/[id]/          # Market detail + trading
│   ├── portfolio/            # Positions, P&L, transactions
│   └── wallet/               # Wallet setup & management
├── components/
│   ├── layout/               # Header, navigation
│   ├── market/               # MarketCard
│   ├── trading/              # TradingPanel, SharesInput, PriceImpact
│   ├── wallet/               # WalletSetup, WalletDisplay, FundingInstructions
│   └── ui/                   # Button, Toaster
├── lib/
│   ├── bitcoin.ts            # Taproot signing, UTXOs, broadcasting
│   ├── charms.ts             # SpellBuilder (create, mint, trade, redeem)
│   ├── charmsApi.ts          # Prover API client
│   ├── store.ts              # Zustand stores (wallet, markets, portfolio)
│   ├── useCharms.ts          # React hook for all Charms operations
│   ├── WalletService.ts      # BIP39/BIP86 wallet management
│   └── utils.ts              # Formatting, calculations
├── contracts/
│   └── echo-markets.wasm     # Compiled Charms contract
└── types/
    └── index.ts              # TypeScript definitions
```

---

## 🔧 Tech Stack

| Category     | Technologies                                                     |
| ------------ | ---------------------------------------------------------------- |
| **Frontend** | Next.js 15, React 19, TypeScript, Tailwind CSS v4, Framer Motion |
| **State**    | Zustand with persist middleware                                  |
| **Bitcoin**  | @scure/btc-signer, @scure/bip32, @scure/bip39                    |
| **Crypto**   | @noble/curves (Schnorr), @noble/hashes (SHA256)                  |
| **Protocol** | Charms                                                           |
| **API**      | Mempool.space API                                                |

---

## 💼 How It Works

### Transaction Flow

```
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
│  User Action │ ──▶ │ SpellBuilder │ ──▶ │ /api/charms/cast│
└─────────────┘     └──────────────┘     └────────┬────────┘
                                                   │
                                                   ▼
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
│   Broadcast │ ◀── │  User Signs  │ ◀── │  Charms Prover  │
│  to Bitcoin │     │  (Schnorr)   │     │ [commit, spell] │
└─────────────┘     └──────────────┘     └─────────────────┘
```

### Market Lifecycle

1. **Create** — Deploy market with question hash, deadlines, fees
2. **Mint** — Users deposit BTC → receive equal YES + NO tokens
3. **Burn** — Users burn equal YES + NO → recover BTC (before resolution)
4. **Trade** — P2P swaps between YES and NO holders
5. **Resolve** — Creator resolves with outcome (YES/NO/Invalid)
6. **Redeem** — Winners burn tokens → receive 1 sat per token
7. **Claim Fees** _(future)_ — Creator withdraws accumulated trading fees
8. **Cancel** _(future)_ — Creator cancels unresolved market, users redeem at cost

### Spell Types

| Spell       | Description                                          | Status               |
| ----------- | ---------------------------------------------------- | -------------------- |
| `Create`    | Deploy new market NFT                                | ✅ Implemented       |
| `Mint`      | Deposit BTC, mint YES+NO tokens                      | ✅ Implemented       |
| `Burn`      | Burn equal YES+NO to recover BTC (before resolution) | ✅ SpellBuilder only |
| `Trade`     | P2P swap (Charms token conservation)                 | ✅ Implemented       |
| `Resolve`   | Set market outcome                                   | ✅ SpellBuilder only |
| `Redeem`    | Burn winning tokens for BTC (after resolution)       | ✅ Implemented       |
| `ClaimFees` | Creator withdraws accumulated fees                   | 🔮 Future            |
| `Cancel`    | Creator cancels market, refunds holders              | 🔮 Future            |

---

## 🎨 Key Components

### useCharms Hook

Central hook for all Charms operations:

```typescript
const { createMarket, mintShares, trade, redeemShares, isLoading } =
  useCharms();

// Create market
const marketId = await createMarket({
  question: "Will BTC reach $150k by 2025?",
  tradingDeadline: 1735689600,
  resolutionDeadline: 1735776000,
  feeBps: 100,
  minBet: 10000,
  maxSupply: 1000000000,
});

// Mint shares
await mintShares({ marketId, amount: 50000 });

// P2P trade
await trade({
  marketId,
  sellOutcome: "Yes",
  sellAmount: 1000,
  sellUtxoId: "abc:0",
  buyUtxoId: "def:1",
  counterpartyAddress: "tb1p...",
});
```

### Wallet Components

```tsx
// Composable wallet UI
{
  !wallet ? (
    <WalletSetup /> // Create or import wallet
  ) : (
    <>
      <WalletDisplay /> // Address, balance, seed phrase
      <FundingInstructions /> // Faucet links, auto-polling
    </>
  );
}
```

### Trading Components

```tsx
<TradingPanel
  market={market}
  onTrade={handleTrade} // Calls useCharms.mintShares()
/>
```

---

## 📊 Implementation Status

### ✅ Complete

| Feature                                                    | Status |
| ---------------------------------------------------------- | ------ |
| Wallet (BIP39/BIP86 Taproot)                               | ✅     |
| Market creation UI + on-chain                              | ✅     |
| Trading UI + on-chain minting                              | ✅     |
| P2P trade function                                         | ✅     |
| Portfolio with real positions                              | ✅     |
| Transaction history                                        | ✅     |
| Confirmation polling                                       | ✅     |
| Charms spells (create, mint, burn, trade, resolve, redeem) | ✅     |
| API routes (prove, cast, broadcast)                        | ✅     |

### ⏸️ Pending

| Item                   | Notes                         |
| ---------------------- | ----------------------------- |
| Contract WASM + APP_VK | Need to add compiled contract |

### 🔮 Future Improvements

- Retry logic for failed broadcasts
- Dynamic fee estimation
- Market resolution UI
- Burn shares UI
- Fee claiming UI for market creators
- Cancel market functionality
- Order book for P2P matching
- On-chain market indexing
- WalletConnect integration

---

## ⚠️ Known Limitations

1. **Testnet Only** — This is testnet software, not production-ready
2. **No Order Book** — P2P trades require knowing counterparty's UTXO
3. **Client-Side Positions** — Positions tracked from app transactions, not blockchain-scanned
4. **Single Address** — Uses primary address only (24-address system exists but unused)
5. **Hardcoded Fees** — Uses 2 sat/vB, no dynamic estimation

---

## 🔐 Security

| Aspect          | Implementation                          |
| --------------- | --------------------------------------- |
| **Key Storage** | Client-side only, never sent to servers |
| **Mnemonic**    | Standard BIP39 12-word phrase           |
| **Signing**     | Schnorr signatures (BIP340)             |
| **Addresses**   | Taproot P2TR (BIP86)                    |

⚠️ **Important:** Save your seed phrase! Keys are stored in browser memory and cleared on refresh.

---

## 🚢 Deployment

### Vercel (Recommended)

1. Push to GitHub
2. Import in Vercel
3. Add environment variables
4. Deploy

### Environment Variables

Set in your deployment platform:

- `CHARMS_PROVER_URL`
- `MEMPOOL_API`
- `APP_VK`
- `APP_WASM_PATH`

---

## 🔗 Links

| Resource        | URL                                   |
| --------------- | ------------------------------------- |
| Testnet Faucet  | https://mempool.space/testnet4/faucet |
| Block Explorer  | https://mempool.space/testnet4        |
| Charms Protocol | https://charms.dev                    |

---

## 🙏 Acknowledgments

- **Charms Protocol** — Bitcoin smart contracts with ZK proofs
- **BitcoinOS** — Bitcoin application layer
- **Encode Club** — Hackathon organizers
- **Mempool.space** — Bitcoin blockchain API

---

## 📄 License

MIT — Built for the BitcoinOS x Encode Club Hackathon

---

_Built with ⚡ for Bitcoin_
