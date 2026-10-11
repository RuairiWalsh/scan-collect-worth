import { createFileRoute } from "@tanstack/react-router";

// Temporary diagnostic: verifies the stored eBay credentials against the live API.
export const Route = createFileRoute("/api/public/ebay-test")({
  server: {
    handlers: {
      GET: async () => {
        const { testEbayAuth } = await import("@/server/prices.server");
        const ok = await testEbayAuth();
        return Response.json({ ebayAuthOk: ok });
      },
    },
  },
});
