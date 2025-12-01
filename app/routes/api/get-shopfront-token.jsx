// app/routes/api/get-shopfront-token.jsx
import { json } from "@remix-run/node";

export async function loader({ request }) {
  const url = new URL(request.url);
  const vendor = url.searchParams.get("vendor") || "plonk";

  const tokens = globalThis.shopfrontTokens?.[vendor];

  if (!tokens) {
    return json({ error: "Token not found. You must authorize first." }, { status: 404 });
  }

  return json({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_in: tokens.expires_in,
  });
}
