# APPLY THE BAKERSS SEO PATCH — STAGING ONLY

This ZIP contains **only changed/new files**, in their existing repository-relative paths. It is **not** a full website and should **not** be uploaded as a single ZIP file to GitHub/Vercel.

1. Keep a backup of the current GitHub `bakerss-site` staging branch.
2. Extract the patch ZIP locally.
3. Within the GitHub repo on branch **staging**, update/upload the files in the extracted folder while **preserving their folder paths**. If your browser cannot bulk-upload nested folders, use a Git client or apply files individually. Do **not** create a second nested `bakerss-site-staging` directory.
4. Commit to the **staging** branch only, not main. Confirm Vercel Preview Ready.
5. Smoke-test `/`, `/learning-center/airbnb-lawn-care-horry-county/`, `/learning-center/airbnb-cleaning-guide-myrtle-beach/`, both legacy calculator alias URLs, `/sitemap.xml`, and `/get-quote/`.
6. Confirm the staging quote form STILL creates a lead in `bakerss-os-staging` Sales CRM. Do not change or re-upload the working staging intake proxy as part of this patch.
7. Read `Bakerss_Final_SEO_Release_Audit.md` before any production deployment.

**Production warning:** The separate staging CRM configuration is enabled in the staging source. That code must not be deployed unchanged to production. The production URL migration map also requires Search Console review.
