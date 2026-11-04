# Bakerss.com — Sitemap Repair & Automatic Updates

## Result of November 4, 2026 source audit
- Original sitemap in uploaded ZIP: 693 URLs.
- Revised sitemap: 682 self-canonical, indexable HTML URLs.
- 11 prior sitemap URLs removed: 9 pages marked `noindex`, 2 canonicalized to another URL.
- 193 HTML routes excluded in total: 178 routes redirected in `vercel.json`, 9 noindex pages, 4 alternate-canonical pages, 1 utility 404 page, and 1 excluded conversion-only page.
- The Parks at Carolina Forest neighborhood route remains in the sitemap.
- No existing HTML page copy, images, design, JS, CSS, or redirects were modified.
- `SITEMAP_GENERATION_REPORT.json` includes every excluded URL and its exclusion reason.

## Deploy safely
1. Back up the current `www.bakerss.com` GitHub repository. Do not upload this ZIP to the separate `bakerss-os` application repository.
2. Copy the CONTENTS of `bakerss-site-main/` into the root of the website repository (including the hidden `.github/` folder). Commit to `main` or use a preview branch then merge.
3. Confirm Vercel deploys this updated website, and open `https://www.bakerss.com/sitemap.xml` to verify it shows the revised sitemap.
4. In GitHub > Actions > `Refresh Bakerss sitemap`, select `Run workflow` once to test. The GitHub Actions workflow runs automatically on pushes to `main` and commits the updated sitemap if its contents changed.
5. GitHub Actions needs repository **Read and write permissions** under Settings > Actions > General > Workflow permissions. Repository/org protections can prevent the workflow's `git push`; if so adjust the workflow policy or integrate `node scripts/generate-sitemap.mjs` into your existing deployment pipeline.
6. In Google Search Console, keep the existing sitemap URL submission `https://www.bakerss.com/sitemap.xml`. Google periodically refetches a sitemap; daily manual submissions are unnecessary.

## Run the generator manually
From the website repository root with Node.js 18+:
`node scripts/generate-sitemap.mjs`

## Editorial follow-up, not silently changed by this repair
- All pages are not necessarily high-quality or deserving of indexing; neighborhood-content mismatches and duplicate text still need manual QA.
- The code scans self-canonical HTML pages. It excludes pages with explicit noindex, known literal redirects, and non-self-canonicals. It cannot confirm production HTTP responses or Google indexing.
- Verify Search Console URL Inspection and internal links for high-value city/service pages.
- `<lastmod>` is intentionally absent because repository file timestamps cannot reliably establish when page content actually changed.
- A sitemap helps discovery but cannot force indexing or rankings.
