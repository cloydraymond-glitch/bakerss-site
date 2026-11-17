# Bakerss Property Services — Final Staging SEO and Release Audit

**Source reviewed:** `bakerss-site-staging.zip`, uploaded November 17, 2026.  
**Scope:** Static source audit + targeted staging patch. Production Google Search Console coverage, actual current backlinks and live site URL migration were **not** available for complete reconciliation. No production deployment performed.

## Verified inventory (before patch)

| Audit item | Finding |
|---|---:|
| HTML files | 879 |
| URLs in uploaded sitemap | 682 |
| Explicit Vercel redirects | 236 |
| Sitemap URLs with missing corresponding HTML | 0 |
| Sitemap URLs that are redirect sources | 0 |
| Sitemap URLs with an explicit `noindex` tag | 1 (`/get-quote/`) |
| Sitemap-eligible self-canonical pages omitted | 1 (`/service-areas/myrtle-beach/neighborhoods/carolina-bays/`) |
| HTML documents with schema JSON-LD | 853 (syntax parse tested, not Rich Results validation) |
| Unparseable JSON-LD scripts | 0 |
| Missing image `alt` attributes on parsed `<img>` tags | 0 |
| Internal links to nonexistent local HTML routes (static link audit) | 0 |
| Missing local CSS, JS, or image references (relative) | 43 occurrences |
| Missing same-domain absolute `img` references | 3 on the homepage |
| Links directly to redirected URLs | 5 occurrences |
| Sitemap Learning Center pages with under 200 words of main content (heuristic) | 66 |

**Word-count caution:** These are automated extraction estimates, not a Google ranking threshold. Low-value content is a quality issue when the page offers little unique guidance, not simply because it is short.

## Included patch corrections

1. **Sitemap consistency:** removed the `noindex` quote-form URL and added one self-canonical neighborhood page. Updated sitemap remains 682 URLs.
2. **Asset correctness:** added a compatible `/css/global.css` for 25 editorial articles whose original stylesheet was absent, corrected 12 references to missing local images, and replaced three missing homepage images with real included assets.
3. **Calculator integrity:** two outdated calculator aliases now redirect to their functioning canonical calculator pages; canonical calculator code remains unchanged.
4. **More relevant redirects:** four former Georgetown County neighborhood aliases now redirect to the actual corresponding Carolina Forest neighborhood pages instead of the homepage.
5. **Internal linking:** two Learning Center landing-page links now point directly at canonical article URLs.
6. **Title differentiation:** commercial maintenance editorial guide title is distinguished from a commercial service-area landing page.
7. **Helpful content:** eight priority thin guides now contain substantive, topic-specific checklists and contextual links to matching Bakerss services. Publication modification dates updated accordingly.
8. **Safety:** did not edit `/api/website-lead.mjs`, Turnstile configuration, secret environment variables, or the Bakerss OS application.

## Remaining release blockers and editorial review

**P0 — Production quote-form cutover.** The staging branch contains `assets/js/bakerss-crm-staging-config.js` with `enabled: true` and a staging Turnstile key. **Do not publish that as production.** The current staging API uses a fixed `bakerss-os-staging.vercel.app` endpoint; production needs a reviewed, separate integration and destination, or the existing email delivery must remain active. Do not point live leads to staging. Verify the live fallback with photo uploads as well as CRM-mode submissions before launch.

**P0 — Full legacy URL reconciliation.** The staging ZIP supplies 238 redirects after patch, but it does not establish whether all old production URLs, backlinks, or indexed URLs are covered. Export the current production URL inventory from Google Search Console or existing site crawl, then map every retired URL to its closest relevant page. Do not bulk-delete the current repository until the migration map and rollback are ready.

**P1 — Editorial content gap.** 58 Learning Center URLs still have under 200 extracted words of primary content. Several are placeholder-style teaser pages and some have off-topic generic copy. See the separate prioritized backlog. Rebuild genuinely useful ones with locally relevant firsthand detail; consolidate or deindex low-value candidates only after checking existing ranking and traffic. Google does not prescribe a minimum word count, and changing the word count alone does not improve ranking.

**P1 — Redirect semantics.** Review remaining broad homepage redirects and unrelated topic redirects (for example `/learning-center/deck-maintenance/` redirecting to a painting guide) before live release. No automatic deletion has been made.

**P1 — Production SEO controls.** At launch, confirm 200 status and correct `rel=canonical` on top URLs, production `robots.txt`, public sitemap, preview `X-Robots-Tag: noindex`, no staging-domain canonicals, and submitted Search Console sitemap. Vercel can automatically noindex Preview deployments; verify headers on actual deployments.

**P1 — Mobile performance and accessibility.** Manually test mobile nav, dropdowns, Lighthouse/Core Web Vitals, high-resolution image size and the quote-form submission on iPhone/Android and desktop. Static source inspection is not an interactive browser audit.

**P2 — Branding and claims QA.** Check service pages for advertised prices, licensure phrasing, response-time commitments, first-party reviews, and city coverage. Avoid schema claims without supporting public page content; schema syntax is not proof of Search eligibility.

## Suggested staged go-live acceptance tests

- [ ] Upload the patch to `bakerss-site` **staging** and confirm Vercel **Preview Ready**.
- [ ] Verify homepage image cards, legacy articles and two calculator alias redirects.
- [ ] Check 8 expanded articles for desktop/mobile readability.
- [ ] Verify staging quote to staging Sales CRM still creates exactly one lead and preserves fallback email workflow.
- [ ] Compare production Search Console URLs to the new redirect map before production changes.
- [ ] Prepare production-specific quote lead intake configuration; do not re-use staging flags.
- [ ] Confirm live sitemap and production search indexing settings.
- [ ] Save a production rollback deploy and then schedule cutover.

## Primary documentation

- Google Search Central: https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls
- Google Search Central: https://developers.google.com/search/docs/essentials/spam-policies
- Google Search Central: https://developers.google.com/search/docs/fundamentals/creating-helpful-content
- Vercel: https://vercel.com/docs/headers/response-headers
