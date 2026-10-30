/* Bakerss Property Services • first-party, privacy-conscious GA4 click tracking.
   Counts click intents, not completed leads; completed lead events must be fired by
   each form's confirmed-success callback via window.bakerssTrackLeadSuccess(). */
(function () {
  'use strict';
  if (window.__bakerssConversionsInstalled) return;
  window.__bakerssConversionsInstalled = true;
  function emit(eventName, params) {
    try {
      if (typeof window.gtag === 'function') window.gtag('event', eventName, params || {});
    } catch (e) { /* Never interfere with a visitor's ability to call or request a quote. */ }
  }
  function nearestLink(el) {
    return el && el.closest ? el.closest('a[href]') : null;
  }
  document.addEventListener('click', function (event) {
    var a = nearestLink(event.target);
    if (!a) return;
    var raw = (a.getAttribute('href') || '').trim();
    if (!raw) return;
    var cleaned = raw.toLowerCase();
    if (cleaned.indexOf('tel:') === 0) {
      emit('click_to_call', { page_path: location.pathname, link_location: 'site' });
    } else if (cleaned.indexOf('mailto:') === 0) {
      emit('click_to_email', { page_path: location.pathname, link_location: 'site' });
    } else if (/^(\/get-quote\/|https?:\/\/www\.bakerss\.com\/get-quote\/|\/cleaning-quote\/|https?:\/\/www\.bakerss\.com\/cleaning-quote\/)/.test(cleaned)) {
      emit('quote_request_click', { page_path: location.pathname, link_location: 'site' });
    }
  }, { passive: true });
  /* An explicit success API prevents form validation errors and attempted submits
     from being incorrectly counted as completed leads. */
  window.bakerssTrackLeadSuccess = function (serviceType) {
    emit('generate_lead', { method: 'website_form', service_type: String(serviceType || 'unspecified').slice(0, 80) });
  };
}());
