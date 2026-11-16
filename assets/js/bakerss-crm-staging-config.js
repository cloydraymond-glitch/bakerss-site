/* STAGING ONLY. Never set enabled=true in the production website.
   Supply the PUBLIC Cloudflare site key, not the secret.
   Both Vercel lead-intake flags must also be explicitly enabled for a controlled staging test. */
window.BAKERSS_CRM_STAGING = Object.freeze({
  enabled: false,
  turnstileSiteKey: 'REPLACE_WITH_PUBLIC_TURNSTILE_SITE_KEY'
});
