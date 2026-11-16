/* STAGING ONLY. Never set enabled=true in the production website.
   Supply the PUBLIC Cloudflare site key, not the secret.
   Both Vercel lead-intake flags must also be explicitly enabled for a controlled staging test. */
window.BAKERSS_CRM_STAGING = Object.freeze({
 enabled: true,
turnstileSiteKey: '0x4AAAAAAGCZz5JFBvdeRpvj'
});
