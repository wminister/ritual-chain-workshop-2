import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET() {
  const configured = Number(process.env.DEMO_ETH_PRICE ?? "4200");
  const price = Number.isSafeInteger(configured) && configured >= 0 ? configured : 4200;

  return NextResponse.json(
    { asset: "ETH/USD", price, timestamp: Date.now() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
