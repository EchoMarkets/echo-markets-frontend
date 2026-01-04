import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";
import type {
  Market,
  MarketPosition,
  TokenBalance,
  Transaction,
  Toast,
  UTXO,
} from "@/types";

// =============================================================================
// WALLET TYPES (Updated for Taproot)
// =============================================================================

export interface TaprootWallet {
  // Address info
  address: string; // tb1p... (P2TR)
  publicKey: string; // 33-byte compressed pubkey (hex)
  internalPubkey: string; // 32-byte x-only pubkey for Taproot (hex)

  // For signing (stored encrypted in production!)
  tweakedPrivateKey: string; // Tweaked private key for Schnorr signing (hex)

  // Derivation info
  path: string; // e.g., "m/86'/1'/0'/0/0"
  index: number; // Address index

  // Balance
  balance: number; // in sats
  utxos: UTXO[];
}

interface WalletState {
  // Wallet data
  wallet: TaprootWallet | null;
  mnemonic: string | null;

  // Status flags
  isGenerated: boolean; // Was wallet generated in this app
  isImported: boolean; // Was wallet imported from seed phrase
  isLoading: boolean;
  error: string | null;

  // Actions
  setWallet: (wallet: TaprootWallet | null) => void;
  setMnemonic: (mnemonic: string | null) => void;
  setGenerated: (isGenerated: boolean) => void;
  setImported: (isImported: boolean) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  updateBalance: (balance: number) => void;
  updateUtxos: (utxos: UTXO[]) => void;
  clearWallet: () => void;

  // Selectors
  isWalletReady: () => boolean;
}

// =============================================================================
// WALLET STORE
// =============================================================================

export const useWalletStore = create<WalletState>()(
  devtools(
    persist(
      (set, get) => ({
        wallet: null,
        mnemonic: null,
        isGenerated: false,
        isImported: false,
        isLoading: false,
        error: null,

        setWallet: (wallet) => set({ wallet }, false, "setWallet"),

        setMnemonic: (mnemonic) => set({ mnemonic }, false, "setMnemonic"),

        setGenerated: (isGenerated) =>
          set({ isGenerated }, false, "setGenerated"),

        setImported: (isImported) => set({ isImported }, false, "setImported"),

        setLoading: (isLoading) => set({ isLoading }, false, "setLoading"),

        setError: (error) => set({ error }, false, "setError"),

        updateBalance: (balance) =>
          set(
            (state) => ({
              wallet: state.wallet ? { ...state.wallet, balance } : null,
            }),
            false,
            "updateBalance"
          ),

        updateUtxos: (utxos) =>
          set(
            (state) => ({
              wallet: state.wallet
                ? {
                    ...state.wallet,
                    utxos,
                    balance: utxos.reduce((sum, u) => sum + u.value, 0),
                  }
                : null,
            }),
            false,
            "updateUtxos"
          ),

        clearWallet: () =>
          set(
            {
              wallet: null,
              mnemonic: null,
              isGenerated: false,
              isImported: false,
              error: null,
            },
            false,
            "clearWallet"
          ),

        // Selector
        isWalletReady: () => {
          const { wallet, isGenerated, isImported } = get();
          return !!(wallet?.address && (isGenerated || isImported));
        },
      }),
      {
        name: "echo-wallet",
        partialize: (state) => ({
          // Only persist mnemonic and flags
          // In production, encrypt mnemonic!
          mnemonic: state.mnemonic,
          isGenerated: state.isGenerated,
          isImported: state.isImported,
        }),
      }
    ),
    { name: "WalletStore" }
  )
);

// =============================================================================
// MARKETS STORE
// =============================================================================

interface MarketsState {
  markets: Market[];
  selectedMarket: Market | null;
  isLoading: boolean;
  error: string | null;
  filter: "all" | "active" | "resolved" | "my";

  // Actions
  setMarkets: (markets: Market[]) => void;
  addMarket: (market: Market) => void;
  updateMarket: (id: string, updates: Partial<Market>) => void;
  removeMarket: (id: string) => void;
  setSelectedMarket: (market: Market | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setFilter: (filter: MarketsState["filter"]) => void;
  clearMarkets: () => void;
}

export const useMarketsStore = create<MarketsState>()(
  devtools(
    (set) => ({
      markets: [],
      selectedMarket: null,
      isLoading: false,
      error: null,
      filter: "all",

      setMarkets: (markets) => set({ markets }, false, "setMarkets"),

      addMarket: (market) =>
        set(
          (state) => ({ markets: [market, ...state.markets] }),
          false,
          "addMarket"
        ),

      updateMarket: (id, updates) =>
        set(
          (state) => ({
            markets: state.markets.map((m) =>
              m.id === id ? { ...m, ...updates } : m
            ),
            selectedMarket:
              state.selectedMarket?.id === id
                ? { ...state.selectedMarket, ...updates }
                : state.selectedMarket,
          }),
          false,
          "updateMarket"
        ),

      removeMarket: (id) =>
        set(
          (state) => ({
            markets: state.markets.filter((m) => m.id !== id),
            selectedMarket:
              state.selectedMarket?.id === id ? null : state.selectedMarket,
          }),
          false,
          "removeMarket"
        ),

      setSelectedMarket: (selectedMarket) =>
        set({ selectedMarket }, false, "setSelectedMarket"),

      setLoading: (isLoading) => set({ isLoading }, false, "setLoading"),

      setError: (error) => set({ error }, false, "setError"),

      setFilter: (filter) => set({ filter }, false, "setFilter"),

      clearMarkets: () =>
        set(
          {
            markets: [],
            selectedMarket: null,
            error: null,
          },
          false,
          "clearMarkets"
        ),
    }),
    { name: "MarketsStore" }
  )
);

// =============================================================================
// PORTFOLIO STORE
// =============================================================================

interface PortfolioState {
  positions: MarketPosition[];
  tokenBalances: TokenBalance[];
  transactions: Transaction[];
  isLoading: boolean;

  // Actions
  setPositions: (positions: MarketPosition[]) => void;
  addPosition: (position: MarketPosition) => void;
  updatePosition: (marketId: string, updates: Partial<MarketPosition>) => void;
  removePosition: (marketId: string) => void;
  setTokenBalances: (balances: TokenBalance[]) => void;
  addTransaction: (tx: Transaction) => void;
  updateTransaction: (txid: string, updates: Partial<Transaction>) => void;
  updateTransactionStatus: (
    txid: string,
    status: "pending" | "confirmed" | "failed"
  ) => void;
  setLoading: (loading: boolean) => void;
  clearPortfolio: () => void;
}

export const usePortfolioStore = create<PortfolioState>()(
  devtools(
    persist(
      (set) => ({
        positions: [],
        tokenBalances: [],
        transactions: [],
        isLoading: false,

        setPositions: (positions) => set({ positions }, false, "setPositions"),

        addPosition: (position) =>
          set(
            (state) => ({ positions: [...state.positions, position] }),
            false,
            "addPosition"
          ),

        updatePosition: (marketId, updates) =>
          set(
            (state) => ({
              positions: state.positions.map((p) =>
                p.marketId === marketId ? { ...p, ...updates } : p
              ),
            }),
            false,
            "updatePosition"
          ),

        removePosition: (marketId) =>
          set(
            (state) => ({
              positions: state.positions.filter((p) => p.marketId !== marketId),
            }),
            false,
            "removePosition"
          ),

        setTokenBalances: (tokenBalances) =>
          set({ tokenBalances }, false, "setTokenBalances"),

        addTransaction: (tx) =>
          set(
            (state) => ({ transactions: [tx, ...state.transactions] }),
            false,
            "addTransaction"
          ),

        updateTransaction: (txid, updates) =>
          set(
            (state) => ({
              transactions: state.transactions.map((t) =>
                t.txid === txid ? { ...t, ...updates } : t
              ),
            }),
            false,
            "updateTransaction"
          ),

        updateTransactionStatus: (txid, status) =>
          set(
            (state) => ({
              transactions: state.transactions.map((t) =>
                t.txid === txid ? { ...t, status } : t
              ),
            }),
            false,
            "updateTransactionStatus"
          ),

        setLoading: (isLoading) => set({ isLoading }, false, "setLoading"),

        clearPortfolio: () =>
          set(
            {
              positions: [],
              tokenBalances: [],
              transactions: [],
            },
            false,
            "clearPortfolio"
          ),
      }),
      {
        name: "echo-portfolio",
        partialize: (state) => ({
          positions: state.positions,
          transactions: state.transactions,
        }),
      }
    ),
    { name: "PortfolioStore" }
  )
);

// =============================================================================
// UI STORE
// =============================================================================

interface UIState {
  toasts: Toast[];
  isWalletModalOpen: boolean;
  isCreateModalOpen: boolean;
  theme: "dark" | "light";
  isProcessing: boolean;
  processingMessage: string | null;

  // Actions
  addToast: (toast: Omit<Toast, "id">) => void;
  removeToast: (id: string) => void;
  clearToasts: () => void;
  setWalletModalOpen: (open: boolean) => void;
  setCreateModalOpen: (open: boolean) => void;
  setTheme: (theme: UIState["theme"]) => void;
  setProcessing: (isProcessing: boolean, message?: string) => void;
}

export const useUIStore = create<UIState>()(
  devtools(
    (set) => ({
      toasts: [],
      isWalletModalOpen: false,
      isCreateModalOpen: false,
      theme: "dark",
      isProcessing: false,
      processingMessage: null,

      addToast: (toast) =>
        set(
          (state) => ({
            toasts: [...state.toasts, { ...toast, id: crypto.randomUUID() }],
          }),
          false,
          "addToast"
        ),

      removeToast: (id) =>
        set(
          (state) => ({
            toasts: state.toasts.filter((t) => t.id !== id),
          }),
          false,
          "removeToast"
        ),

      clearToasts: () => set({ toasts: [] }, false, "clearToasts"),

      setWalletModalOpen: (isWalletModalOpen) =>
        set({ isWalletModalOpen }, false, "setWalletModalOpen"),

      setCreateModalOpen: (isCreateModalOpen) =>
        set({ isCreateModalOpen }, false, "setCreateModalOpen"),

      setTheme: (theme) => set({ theme }, false, "setTheme"),

      setProcessing: (isProcessing, message) =>
        set(
          {
            isProcessing,
            processingMessage: message || null,
          },
          false,
          "setProcessing"
        ),
    }),
    { name: "UIStore" }
  )
);

// =============================================================================
// HELPER HOOKS
// =============================================================================

/**
 * Get filtered markets based on current filter
 */
export const useFilteredMarkets = () => {
  const { markets, filter } = useMarketsStore();
  const { wallet } = useWalletStore();

  switch (filter) {
    case "active":
      return markets.filter((m) => m.status === "Active");
    case "resolved":
      return markets.filter((m) => m.status === "Resolved");
    case "my":
      return markets.filter((m) => m.creator === wallet?.publicKey);
    default:
      return markets;
  }
};

/**
 * Get user position for a specific market
 */
export const useMarketPosition = (marketId: string) => {
  const { positions } = usePortfolioStore();
  return positions.find((p) => p.marketId === marketId) || null;
};

/**
 * Calculate total portfolio value in sats
 */
export const usePortfolioValue = () => {
  const { positions } = usePortfolioStore();
  const { markets } = useMarketsStore();

  return positions.reduce((total, pos) => {
    const market = markets.find((m) => m.id === pos.marketId);
    if (!market) return total;

    const yesValue = pos.yesTokens * (market.yesPrice / 100);
    const noValue = pos.noTokens * (market.noPrice / 100);

    return total + yesValue + noValue;
  }, 0);
};

/**
 * Check if wallet is ready for transactions
 */
export const useIsWalletReady = () => {
  const { wallet, isGenerated, isImported } = useWalletStore();
  return !!(wallet?.address && (isGenerated || isImported));
};

/**
 * Get wallet balance with formatted display
 */
export const useWalletBalance = () => {
  const { wallet } = useWalletStore();

  if (!wallet) return { sats: 0, btc: 0, formatted: "0 sats" };

  const sats = wallet.balance;
  const btc = sats / 100_000_000;

  let formatted: string;
  if (sats >= 100_000_000) {
    formatted = `${btc.toFixed(4)} BTC`;
  } else if (sats >= 1_000_000) {
    formatted = `${(sats / 1_000_000).toFixed(2)}M sats`;
  } else if (sats >= 1_000) {
    formatted = `${(sats / 1_000).toFixed(1)}K sats`;
  } else {
    formatted = `${sats.toLocaleString()} sats`;
  }

  return { sats, btc, formatted };
};

// =============================================================================
// GLOBAL RESET
// =============================================================================

/**
 * Reset all stores to initial state
 */
export const resetAllStores = () => {
  useWalletStore.getState().clearWallet();
  useMarketsStore.getState().clearMarkets();
  usePortfolioStore.getState().clearPortfolio();
  useUIStore.getState().clearToasts();
};
