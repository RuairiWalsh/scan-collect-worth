<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture
- Bulk scanner PDFs render one pair at a time in the browser via dynamically loaded PDF.js and upload lossless page images to private storage; durable import/pair rows support reselection and resume without repeating identification. SSR-reachable PDF helpers use normal filenames, never *.client.*, with browser APIs and PDF.js imports inside event-invoked functions to satisfy import protection.
- Admin scanner imports identify both sides without CardMagic, publish only confident exact identities, and auto-approve after server-side role checks; ambiguous pairs require manual identity confirmation and never retain an uncertain catalog match.
- Scanner image delivery checks approved-cache anonymous RLS before reading private storage; front/back images stay in storage rather than large database data URLs.
- Admin image review lives on the dedicated /admin-images page, linked from /admin, to keep the overview focused on stats and user management.
- The front-screen featured card reads only its exact catalog entry through anonymous column-scoped access and is always included in shared daily cache refreshes even if nobody owns it, avoiding provider calls for visitors.
- Exact card quality/printing selection lives in src/lib/card-pricing.ts and is shared by editing, search details, and nightly revaluation; missing provider combinations return no price, never a near-mint multiplier fallback.
- Server functions live in src/lib/*.functions.ts; server-only helpers in src/server/*.server.ts (src/server is blocked from client bundles).
- Item identification uses the AI Gateway Responses API via raw streamed fetch in src/server/ai.server.ts — keeps worker bundle small.
- Prices come from pluggable sources in src/server/prices.server.ts; pure math in src/lib/pricing.ts (tested) — add new sources there.
- Collectible taxonomy and condition multipliers live in src/lib/taxonomy.ts — single source for categories.
- Card scans are pinned to an exact JustTCG catalog card (items.catalog_id) in src/server/identify.server.ts; pricing fetches by that id, and editing a card's identity clears it — prevents prices from a look-alike printing.
- JustTCG search must use the `q` parameter (the `name` parameter is silently ignored); match logic lives in src/lib/catalog.ts (tested).
- Keep the original scan in items.thumbnail and scan-derived CardMagic images in items.product_image; never display or fetch provider catalog artwork. items.official_image is deprecated.
- Live scan finds cards with a pure, tested rectangle detector (src/lib/card-detect.ts) instead of a fixed guide box — runs every tick on-device with no ML download.

- Stamp collection facets are derived in src/lib/stamp-filters.ts from existing item metadata, with unknown buckets rather than guessed classifications; this keeps filtering client-side without changing scan or storage behavior.

- Coin collection facets are derived in src/lib/coin-filters.ts from existing identity metadata only, never condition or grading fields; unknown buckets keep filtering honest without changing scan or storage behavior.
- Scan language is part of identification; Japanese Pokémon match JustTCG's separate pokemon-japan catalog, other games filter candidates by variant language — avoids pricing a Japanese card from the English printing.
- Roles live only in public.user_roles, checked via public.has_role(); admin actions and cross-user reads (stats, user list, marketplace view of private items) go through SECURITY DEFINER SQL functions that verify the caller's role — never client-side flags.
- Route loaders must never throw: wrap data lookups in try/catch and return an empty fallback, because a rejected loader renders the router error boundary and blanks the whole page.
- Merchant order status changes go only through public.merchant_update_order (SECURITY DEFINER; transitions mirrored in src/lib/orders.ts, tested); orders has no client insert/update policy so future checkout and shipping webhooks write server-side.

- CardMagic processing lives in src/server/cardmagic.server.ts: POST /v1/cardmagic/process uploads the user's scan, not catalog artwork. Exact printing/language identities share public.card_product_images through server-only atomic claims; ambiguous identities use a scan hash. Search, featured cards, collection and marketplace must use this cache or the original scan, never catalog_prices.image.
- Shared images require review_status='approved' enforced by RLS and marketplace RPC; admin_image_queue/admin_review_image verify the admin role server-side. Pending cache reuse is restricted to the authenticated submitter, preserving private scans without publishing unreviewed photos.
