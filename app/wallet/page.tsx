"use client";

import { useWalletStore } from "@/lib/store";
import {
  WalletSetup,
  WalletDisplay,
  FundingInstructions,
} from "@/components/wallet";

export default function WalletPage() {
  const { wallet } = useWalletStore();

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {!wallet ? (
        <WalletSetup />
      ) : (
        <>
          <WalletDisplay />
          <FundingInstructions />
        </>
      )}
    </div>
  );
}
