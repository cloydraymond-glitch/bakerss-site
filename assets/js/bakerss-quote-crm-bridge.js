/* Bakerss quote form -> staging CRM bridge. Stays inactive until explicitly opted in.\n   Existing FormSubmit handler, photo uploads and email delivery are untouched by default. */
(function () {
  'use strict';
  const config = window.BAKERSS_CRM_STAGING || {};
  if (config.enabled !== true) return;
  const form = document.getElementById('qf');
  if (!form) return;
  const go = document.getElementById('go');
  const notice = document.createElement('div');
  notice.setAttribute('role', 'status');
  notice.style.cssText = 'padding:12px 14px;margin:12px 0;background:#281523;border:1px solid #e8197d;border-radius:10px;color:#fff;font-size:13px;line-height:1.6';
  notice.textContent = 'Staging CRM test mode: an email and detailed description are required. Photos can only be submitted through the existing email form.';
  form.insertBefore(notice, go);
  const email = document.getElementById('email');
  const details = document.getElementById('details');
  email.required = true;
  details.required = true;
  details.minLength = 10;
  details.maxLength = 2500;
  const alternate = document.createElement('label');
  alternate.style.cssText = 'display:block;color:#fff;font-size:13px;margin:8px 0 14px';
  alternate.innerHTML = '<input type="checkbox" id="use-email-delivery" style="margin-right:7px">Use existing email delivery instead (supports photo attachments; does not create a CRM opportunity)';
  form.insertBefore(alternate, go);
  const sendByEmail = alternate.querySelector('input');
  function syncAlternate() {
    const crmMode = !sendByEmail.checked;
    email.required = crmMode;
    details.required = crmMode;
    details.minLength = crmMode ? 10 : 0;
    notice.style.display = crmMode ? '' : 'none';
    verifyRow.style.display = crmMode ? '' : 'none';
  }
  const verifyRow = document.createElement('div');
  verifyRow.style.cssText = 'margin:12px 0';
  form.insertBefore(verifyRow, alternate);
  sendByEmail.addEventListener('change', syncAlternate);
  let widgetId = null;
  function msg(message) {
    const alert = document.getElementById('err');
    alert.textContent = message;
    alert.classList.add('on');
    alert.focus();
  }
  function getText(id) { return (document.getElementById(id).value || '').trim(); }
  const serviceMap = {
    'Handyman & repairs':'Handyman', 'Cleaning':'Interior cleaning',
    'Lawn care & landscaping':'Lawn care', 'Pool maintenance':'Pool maintenance',
    'Pressure washing':'Pressure washing', 'HVAC':'HVAC repair / maintenance',
    'Property maintenance plan':'Other property service',
    'HOA / apartment / commercial':'Commercial maintenance',
    'Window cleaning':'Window cleaning', 'Other / multiple services':'Other property service'
  };
  const propertyMap = {
    'Home':'Residential', 'Condo / townhome':'Residential',
    'Rental / Airbnb':'Vacation rental / second home',
    'HOA / community':'HOA / community',
    'Apartment community':'Apartment / multifamily', 'Commercial':'Commercial'
  };
  const whenMap = {
    'As soon as possible':'As soon as available',
    'This week':'Within 1 week', 'Within a month':'Within 2–4 weeks',
    'Flexible / just pricing':'Flexible / request a quote'
  };
  const allowedSiteKey = typeof config.turnstileSiteKey === 'string' &&
    /^0x[A-Za-z0-9_-]{12,}$/.test(config.turnstileSiteKey);
  const script = document.createElement('script');
  if (allowedSiteKey) {
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.onload = function () {
      if (!window.turnstile) return;
      widgetId = window.turnstile.render(verifyRow, {
        sitekey: config.turnstileSiteKey,
        action: 'website_quote',
        theme: 'dark'
      });
    };
    script.onerror = function () { msg('Security verification could not load. Please use existing email delivery or call Bakerss.'); };
    document.head.appendChild(script);
  } else {
    verifyRow.textContent = 'CRM test unavailable: add the public Cloudflare Turnstile Site Key in the staging configuration file.';
  }
  const requestId = (window.crypto && typeof window.crypto.randomUUID === 'function') ? window.crypto.randomUUID() : null;
  // Capture handler runs before the existing FormSubmit handler. The email option leaves it untouched.
  form.addEventListener('submit', async function (event) {
    if (sendByEmail.checked) return; // Allow the original, photo-capable FormSubmit handler.
    event.preventDefault();
    event.stopImmediatePropagation();
    if (go.disabled) return;
    document.getElementById('err').classList.remove('on');
    if (form.elements['_honey'].value.trim()) return;
    const checked = form.querySelector('input[name="service"]:checked');
    const fullName = getText('name'), phone = getText('phone'), city = getText('city');
    const userEmail = getText('email'), description = getText('details');
    const photoInput = document.getElementById('photos');
    // The original form maintains its selected files in a closure, so use the rendered list.
    if (document.querySelectorAll('#files li').length || (photoInput && photoInput.files.length)) {
      msg('Photos are not transmitted to Bakerss OS in this test. Select “Use existing email delivery instead” to send your photos, or remove the photos for the CRM test.');
      return;
    }
    if (!checked || !fullName || fullName.length < 2 || fullName.length > 120 ||
        !/^[+\d() .-]{7,30}$/.test(phone) || !city || city.length > 180 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(userEmail) || userEmail.length > 150 ||
        description.length < 10 || description.length > 2500) {
      msg('Please select a service and supply your name, phone, city, valid email, and at least 10 characters of details.');
      return;
    }
    if (!requestId || widgetId === null || !window.turnstile) {
      msg('CRM verification is not available. Use existing email delivery or call Bakerss.'); return;
    }
    const token = window.turnstile.getResponse(widgetId);
    if (!token) { msg('Complete the security verification before submitting.'); return; }
    const rawService = checked.value;
    const rawProperty = getText('ptype');
    let service = serviceMap[rawService] || 'Other property service';
    let property = propertyMap[rawProperty] || 'Residential';
    if (rawService === 'HOA / apartment / commercial') {
      service = property === 'HOA / community' ? 'HOA maintenance' :
        property === 'Apartment / multifamily' ? 'Apartment maintenance' : 'Commercial maintenance';
    }
    const contactPreference = form.querySelector('input[name="contact_preference"]:checked')?.value || 'Call';
    const extendedDetails = description + '\nPreferred contact: ' + contactPreference;
    const payload = {
      request_id: requestId,
      full_name: fullName, phone, email: userEmail,
      service, property_type: property, location: city,
      timeframe: whenMap[getText('when')] || 'Flexible / request a quote',
      details: extendedDetails, source: '/get-quote/', turnstile_token: token
    };
    if (extendedDetails.length > 2500) { msg('Please shorten your details slightly.'); return; }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    go.disabled = true;
    go.textContent = 'Sending securely…';
    try {
      const response = await fetch('/api/website-lead', {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(payload), signal: controller.signal, cache: 'no-store'
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body.received !== true) throw new Error(body.error || 'Delivery could not be confirmed');
      document.getElementById('d-name').textContent = fullName.split(' ')[0];
      document.getElementById('d-pref').textContent = contactPreference === 'Email' ? 'email' : contactPreference === 'Text' ? 'text' : 'phone';
      const recap = document.getElementById('recap');
      recap.textContent = 'Service: '+service+' · City: '+city+' · Reference: '+(body.reference || 'Recorded');
      form.style.display = 'none';
      document.getElementById('fh').textContent = 'All set';
      const done = document.getElementById('done');
      done.classList.add('on'); done.focus();
      if (typeof window.gtag === 'function') window.gtag('event','generate_lead',{form_id:'quote_crm_staging',service,city});
    } catch (e) {
      msg('We could not confirm receipt in Bakerss OS. Your information remains here. Do NOT assume the request was received. Please call 843-467-7136 or choose existing email delivery.');
      if (window.turnstile && widgetId !== null) window.turnstile.reset(widgetId);
    } finally {
      clearTimeout(timeout);
      go.disabled = false;
      go.textContent = 'Send My Free Quote Request';
    }
  }, true);
  syncAlternate();
})();
