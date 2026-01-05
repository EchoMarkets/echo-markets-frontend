/**
 * API Route: POST /api/bitcoin/submitpackage
 *
 * Broadcast a package of transactions atomically using Bitcoin Core's submitpackage RPC.
 * Used for Charms prover transaction bundles where both commit and spell spend the same funding UTXO.
 */

import { NextRequest, NextResponse } from "next/server";

// Bitcoin Core RPC configuration
const BITCOIND_RPC_URL =
  process.env.BITCOIND_RPC_URL || "http://localhost:18332";
const BITCOIND_RPC_USER = process.env.BITCOIND_RPC_USER || "";
const BITCOIND_RPC_PASS = process.env.BITCOIND_RPC_PASS || "";

interface SubmitPackageRequest {
  txs: string[]; // Array of raw transaction hex strings (topologically sorted)
}

interface RPCError {
  code: number;
  message: string;
}

interface RPCResponse {
  result?: {
    package_msg?: string;
    txids?: string[];
    txresults?: Array<{
      txid: string;
      wtxid: string;
      allowed?: boolean;
      vsize?: number;
      fees?: {
        base: number;
      };
    }>;
  };
  error?: RPCError;
}

export async function POST(request: NextRequest) {
  try {
    // Check if RPC credentials are configured
    if (!BITCOIND_RPC_USER || !BITCOIND_RPC_PASS) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Package relay required: configure BITCOIND_RPC or use a broadcaster that supports submitpackage.",
        },
        { status: 500 }
      );
    }

    const body: SubmitPackageRequest = await request.json();
    const { txs } = body;

    if (!Array.isArray(txs) || txs.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Invalid request: txs must be a non-empty array of transaction hex strings",
        },
        { status: 400 }
      );
    }

    // Validate all entries are hex strings
    for (const tx of txs) {
      if (typeof tx !== "string" || !/^[0-9a-fA-F]+$/.test(tx)) {
        return NextResponse.json(
          {
            success: false,
            error: "Invalid request: all txs must be valid hex strings",
          },
          { status: 400 }
        );
      }
    }

    // Call Bitcoin Core submitpackage RPC
    const rpcResponse = await fetch(BITCOIND_RPC_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${Buffer.from(
          `${BITCOIND_RPC_USER}:${BITCOIND_RPC_PASS}`
        ).toString("base64")}`,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "submitpackage",
        params: [txs],
      }),
    });

    if (!rpcResponse.ok) {
      const errorText = await rpcResponse.text();
      return NextResponse.json(
        {
          success: false,
          error: `Bitcoin Core RPC error: ${rpcResponse.status} ${errorText}`,
        },
        { status: rpcResponse.status }
      );
    }

    const rpcResult: RPCResponse = await rpcResponse.json();

    if (rpcResult.error) {
      return NextResponse.json(
        {
          success: false,
          error: `Bitcoin Core RPC error: ${rpcResult.error.code} ${rpcResult.error.message}`,
          rpcError: rpcResult.error,
        },
        { status: 500 }
      );
    }

    // Extract transaction IDs from results
    const txids: string[] = [];
    if (rpcResult.result?.txresults) {
      for (const txResult of rpcResult.result.txresults) {
        if (txResult.txid) {
          txids.push(txResult.txid);
        }
      }
    }

    return NextResponse.json({
      success: true,
      package_msg: rpcResult.result?.package_msg,
      txids,
      txresults: rpcResult.result?.txresults,
    });
  } catch (error) {
    console.error("Error in submitpackage route:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unknown error in submitpackage",
      },
      { status: 500 }
    );
  }
}
