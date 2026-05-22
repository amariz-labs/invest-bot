// UDF /time — server time in unix seconds (NOT milliseconds).
// Returns as text/plain per TradingView's UDF spec.

export const dynamic = "force-dynamic";

export function GET() {
  const seconds = Math.floor(Date.now() / 1000);
  return new Response(String(seconds), {
    status: 200,
    headers: { "content-type": "text/plain" },
  });
}
