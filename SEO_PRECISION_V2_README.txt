BAKERSS SEO PRECISION v2

Changes:
- Repairs the invalid JSON-LD on /apartment-maintenance/.
- Replaces legacy public email cloyd.raymond@yahoo.com with info@bakerss.com where present in HTML.
- Normalizes the legacy exact business phrase “Bakerss Property Maintenance” to “Bakerss Property Services” for entity/name consistency.
- Adds permanent redirects for /index.html and several high-confidence internal dead-end URLs.
- Preserves GA4 lead tracking from v1.
- Does NOT mass rewrite service-area pages, sitemap, canonicals, or schema beyond the known invalid block/entity naming consistency.

After deploy:
1. Verify Vercel deployment is Ready and site renders normally.
2. In Search Console, Validate Fix for “Bad escape sequence in string.”
3. Inspect https://www.bakerss.com/index.html and confirm it redirects to /.
4. Do not request indexing for all 62 crawled-not-indexed URLs at once.
5. Allow Google to recrawl; use Search Console data to prioritize money-page clusters.
