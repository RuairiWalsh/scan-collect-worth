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
- Exact card quality/printing selection lives in src/lib/card-pricing.ts and is shared by editing, search details, and nightly revaluation; missing provider combinations return no price, never a near-mint multiplier fallback.
- Server functions live in src/lib/*.functions.ts; server-only helpers in src/server/*.server.ts (src/server is blocked from client bundles).
- Item identification uses the AI Gateway Responses API via raw streamed fetch in src/server/ai.server.ts — keeps worker bundle small.
- Prices come from pluggable sources in src/server/prices.server.ts; pure math in src/lib/pricing.ts (tested) — add new sources there.
- Collectible taxonomy and condition multipliers live in src/lib/taxonomy.ts — single source for categories.
- Card scans are pinned to an exact JustTCG catalog card (items.catalog_id) in src/server/identify.server.ts; pricing fetches by that id, and editing a card's identity clears it — prevents prices from a look-alike printing.
- JustTCG search must use the `q` parameter (the `name` parameter is silently ignored); match logic lives in src/lib/catalog.ts (tested).
- Keep the original scan in items.thumbnail and matched catalog artwork in items.official_image; resolve provider artwork only from the exact catalog entry's external IDs to avoid look-alike images.
- Live scan finds cards with a pure, tested rectangle detector (src/lib/card-detect.ts) instead of a fixed guide box — runs every tick on-device with no ML download.

- Stamp collection facets are derived in src/lib/stamp-filters.ts from existing item metadata, with unknown buckets rather than guessed classifications; this keeps filtering client-side without changing scan or storage behavior.

- Coin collection facets are derived in src/lib/coin-filters.ts from existing identity metadata only, never condition or grading fields; unknown buckets keep filtering honest without changing scan or storage behavior.
- Scan language is part of identification; Japanese Pokémon match JustTCG's separate pokemon-japan catalog, other games filter candidates by variant language — avoids pricing a Japanese card from the English printing.
- Roles live only in public.user_roles, checked via public.has_role(); admin actions and cross-user reads (stats, user list, marketplace view of private items) go through SECURITY DEFINER SQL functions that verify the caller's role — never client-side flags.
- Route loaders must never throw: wrap data lookups in try/catch and return an empty fallback, because a rejected loader renders the router error boundary and blanks the whole page.
