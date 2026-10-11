import { createFileRoute } from "@tanstack/react-router";

// eBay Marketplace Account Deletion/Closure notifications.
// eBay verifies this endpoint with a GET containing ?challenge_code=... and
// expects { challengeResponse: sha256hex(challengeCode + verificationToken + endpointUrl) }.
// The endpoint URL must match exactly what is registered in the eBay dashboard.
const ENDPOINT_URL = "https://lymitz.com/api/public/ebay-account-deletion";

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export const Route = createFileRoute("/api/public/ebay-account-deletion")({
  server: {
    handlers: {
      // Verification challenge from eBay
      GET: async ({ request }) => {
        const challengeCode = new URL(request.url).searchParams.get("challenge_code");
        const token = process.env["EBAY_DELETION_VERIFY_TOKEN"];
        if (!challengeCode || !token) {
          return Response.json({ error: "bad request" }, { status: 400 });
        }
        const challengeResponse = await sha256Hex(challengeCode + token + ENDPOINT_URL);
        return Response.json({ challengeResponse });
      },
      // Actual deletion/closure notifications
      POST: async ({ request }) => {
        let body: unknown = null;
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: "bad request" }, { status: 400 });
        }
        // No Lymitz account data is keyed by eBay IDs yet, so there is nothing
        // to delete — acknowledge receipt so eBay considers it delivered.
        console.log("eBay account deletion notification received", JSON.stringify(body));
        return Response.json({ acknowledged: true });
      },
    },
  },
});
