/**
 * API Route: POST /api/charms/broadcast
 *
 * Broadcasts a signed transaction to Bitcoin testnet4 via mempool.space
 *
 * Request:
 *   { txHex: string }
 *
 * Response:
 *   { success: true, txid: string }
 */

import { NextRequest, NextResponse } from "next/server";

const MEMPOOL_API =
  process.env.MEMPOOL_API || "https://mempool.space/testnet4/api";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { txHex } = body;

    if (!txHex) {
      return NextResponse.json({ error: "Missing txHex" }, { status: 400 });
    }

    // Validate hex
    if (!/^[a-fA-F0-9]+$/.test(txHex)) {
      return NextResponse.json(
        { error: "Invalid transaction hex" },
        { status: 400 }
      );
    }

    console.log(`Broadcasting tx (${txHex.length / 2} bytes)...`);

    // Broadcast to mempool.space
    const response = await fetch(`${MEMPOOL_API}/tx`, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain",
      },
      body: txHex,
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("Broadcast failed:", error);

      return NextResponse.json(
        {
          error: "Broadcast failed",
          details: error,
        },
        { status: response.status }
      );
    }

    const txid = await response.text();

    console.log(`Broadcast successful: ${txid}`);
    console.log(`Explorer: https://mempool.space/testnet4/tx/${txid}`);

    return NextResponse.json({
      success: true,
      txid,
      explorerUrl: `https://mempool.space/testnet4/tx/${txid}`,
    });
  } catch (error) {
    console.error("Broadcast error:", error);

    return NextResponse.json(
      {
        error: "Broadcast failed",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/charms/broadcast?txid=xxx
 *
 * Check transaction status
 */
export async function GET(request: NextRequest) {
  const txid = request.nextUrl.searchParams.get("txid");

  if (!txid) {
    return NextResponse.json(
      { error: "Missing txid parameter" },
      { status: 400 }
    );
  }

  try {
    const response = await fetch(`${MEMPOOL_API}/tx/${txid}/status`);

    if (!response.ok) {
      return NextResponse.json({
        found: false,
        txid,
      });
    }

    const status = await response.json();

    return NextResponse.json({
      found: true,
      txid,
      confirmed: status.confirmed,
      blockHeight: status.block_height,
      blockTime: status.block_time,
      explorerUrl: `https://mempool.space/testnet4/tx/${txid}`,
    });
  } catch {
    return NextResponse.json(
      {
        error: "Failed to check status",
        txid,
      },
      { status: 500 }
    );
  }
}
