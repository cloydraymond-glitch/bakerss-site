/* STAGING ONLY. Enabled only on the verified staging Preview hostname. Production uses the existing email form.
   Supply the PUBLIC Cloudflare site key, not the secret.
   Both Vercel lead-intake flags must also be explicitly enabled for a controlled staging test. */
window.BAKERSS_CRM_STAGING = Object.freeze({
 enabled: window.location.hostname.toLowerCase() === 'bakerss-site-git-staging-cloydraymond-4879s-projects.vercel.app',
turnstileSiteKey: '0x4AAAAAAGCZz5JFBvdeRpvj'
});
