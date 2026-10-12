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
- Just listed selects seller photos via market_listings_with_photos and listingImage; signed storage links refresh in marketQuery to avoid expiration.
- The front-screen featured card reads only its exact catalog entry through anonymous column-scoped access and is always included in shared daily cache refreshes even if nobody owns it, avoiding provider calls for visitors.
- Exact card quality/printing selection lives in src/lib/card-pricing.ts and is shared by editing, search details, and nightly revaluation; missing provider combinations return no price, never a near-mint multiplier fallback.
- Server functions live in src/lib/*.functions.ts; server-only helpers in src/server/*.server.ts (src/server is blocked from client bundles).
- Reviewed imports create catalog_prices records with separate provider IDs or lymitz-prefixed local IDs; imported_card keeps unowned cards in daily refreshes.
- Collectible taxonomy and condition multipliers live in src/lib/taxonomy.ts — single source for categories.
- Card scans are pinned to an exact JustTCG catalog card (items.catalog_id) in src/server/identify.server.ts; pricing fetches by that id, and editing a card's identity clears it — prevents prices from a look-alike printing.
- JustTCG search must use the `q` parameter (the `name` parameter is silently ignored); match logic lives in src/lib/catalog.ts (tested).
- Keep the original scan in items.thumbnail and scan-derived CardMagic images in items.product_image; TCG artwork comes from TCGGraph CDN URLs cached once per catalog card on catalog_prices.tcggraph_image (misses rechecked after 30 days) and preferred everywhere; CardMagic and the original scan are fallbacks — avoids repeated API calls. items.official_image is deprecated.
- Live scan finds cards with a pure, tested rectangle detector (src/lib/card-detect.ts) instead of a fixed guide box — runs every tick on-device with no ML download.
- Stamp collection facets are derived in src/lib/stamp-filters.ts from existing item metadata, with unknown buckets rather than guessed classifications; this keeps filtering client-side without changing scan or storage behavior.
- Coin collection facets are derived in src/lib/coin-filters.ts from existing identity metadata only, never condition or grading fields; unknown buckets keep filtering honest without changing scan or storage behavior.
- Scan language is part of identification; Japanese Pokémon match JustTCG's separate pokemon-japan catalog, other games filter candidates by variant language — avoids pricing a Japanese card from the English printing.
- Roles live only in public.user_roles, checked via public.has_role(); admin actions and cross-user reads (stats, user list, marketplace view of private items) go through SECURITY DEFINER SQL functions that verify the caller's role — never client-side flags.
- Route loaders must never throw: wrap data lookups in try/catch and return an empty fallback, because a rejected loader renders the router error boundary and blanks the whole page.
- Merchant order status changes go only through public.merchant_update_order (SECURITY DEFINER; transitions mirrored in src/lib/orders.ts, tested); orders has no client insert/update policy so future checkout and shipping webhooks write server-side.
- src/server has its own AGENTS.md (provider, coin and stamp catalog rules) — read it before changing files there.
