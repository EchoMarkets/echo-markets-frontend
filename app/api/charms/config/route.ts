/**
 * API Route: GET /api/charms/config
 *
 * Returns configuration values needed by the client (like APP_VK)
 */

import { NextResponse } from "next/server";

const APP_VK = process.env.APP_VK || "";

export async function GET() {
  return NextResponse.json({
    appVk: APP_VK,
  });
}
