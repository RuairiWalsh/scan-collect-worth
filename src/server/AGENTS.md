## Admin PDF scanner imports
- Bulk scanner PDFs render one pair at a time in the browser via dynamically loaded PDF.js and upload lossless page images to private storage; durable import/pair rows support reselection and resume without repeating identification. SSR-reachable PDF helpers use normal filenames, never *.client.*, with browser APIs and PDF.js imports inside event-invoked functions to satisfy import protection.
- Every scanner pair waits for explicit admin match confirmation before publishing unchanged scans. Corrected details are rematched server-side to prevent wrong-card prices.
- Scanner image delivery checks approved-cache anonymous RLS before reading private storage; front/back images stay in storage rather than large database data URLs.
