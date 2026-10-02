BAKERSS.COM - CLEAN VERCEL RECOVERY BUILD

Purpose: public marketing/SEO website only.
This package intentionally removes the Bakerss internal operations app source from the public website deployment.

IMPORTANT:
- index.html is at the deployment root.
- robots.txt and sitemap.xml are preserved.
- vercel.json redirects and headers are preserved.
- Existing public HTML service, service-area, learning-center, neighborhood, portfolio, pricing, reviews, and other SEO pages are preserved.
- Canonical URLs and on-page SEO content are preserved from the supplied site archive.

Vercel: deploy this folder as a static site with Framework Preset = Other and Root Directory = ./
Do not set a build command or output directory for this static recovery build.
After the deployment URL works, assign bakerss.com and www.bakerss.com to THIS project and set www.bakerss.com as the primary/canonical domain if that matches the existing domain configuration.
