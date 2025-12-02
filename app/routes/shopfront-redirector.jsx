import { redirect } from "@remix-run/node";

globalThis.shopfrontStates = globalThis.shopfrontStates || {};

function generateState(vendor) {
  const state = `${vendor}-${Date.now()}`;
  globalThis.shopfrontStates[vendor] = {
    state,
    timeout: setTimeout(() => delete globalThis.shopfrontStates[vendor], 5 * 60 * 1000),
  };
  return state;
}

export async function loader({ request }) {
  const url = new URL(request.url);
  const vendor = url.searchParams.get("vendor") || "plonk";
  const state = generateState(vendor);

  const authUrl = new URL(`https://${vendor}.onshopfront.com/oauth/authorize`);
  authUrl.searchParams.set("client_id", "eXYJMyar5WOhLu67vgU5M1rVgvEYuETa");
  authUrl.searchParams.set(
    "redirect_uri",
    "https://on-shopfront-sync.vercel.app/shopfront-callback"
  );
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("scopes", "modify_integrations create_webhooks sell see_products");

  return redirect(authUrl.toString());
}
