/* Bakerss Property Services - unobtrusive conversion interaction tracking.
   Google Analytics is optional; events are emitted only if gtag is available. */
(function () {
  'use strict';
  document.addEventListener('click', function (event) {
    var element = event.target && event.target.closest ? event.target.closest('a[href]') : null;
    if (!element || typeof window.gtag !== 'function') return;
    var href = element.getAttribute('href') || '';
    if (/^tel:/i.test(href)) window.gtag('event', 'phone_click', {event_category:'engagement'});
    if (/^mailto:/i.test(href)) window.gtag('event', 'email_click', {event_category:'engagement'});
  }, false);
}());
