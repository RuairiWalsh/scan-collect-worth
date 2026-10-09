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
- Server functions live in src/lib/*.functions.ts; server-only helpers in src/server/*.server.ts (src/server is blocked from client bundles).
- Item identification uses the AI Gateway Responses API via raw streamed fetch in src/server/ai.server.ts — keeps worker bundle small.
- Prices come from pluggable sources in src/server/prices.server.ts; pure math in src/lib/pricing.ts (tested) — add new sources there.
- Collectible taxonomy and condition multipliers live in src/lib/taxonomy.ts — single source for categories.
