(() => {
  'use strict';
  const form = document.getElementById('cleaning-form');
  const consent = document.getElementById('measurement');
  const status = document.getElementById('form-status');
  const button = document.getElementById('submit');
  const params = new URLSearchParams(location.search);
  const id = '2505195356625462';
  let pixelStarted = false;
  function pixel() {
    if (!consent.checked) return;
    if (pixelStarted) { window.fbq('consent','grant'); return; }
    pixelStarted = true;
    // Standard Meta loader. No token or raw contact data in browser events.
    if (!window.fbq) {
      const n = window.fbq = function(){n.callMethod ? n.callMethod.apply(n,arguments) : n.queue.push(arguments);};
      if (!window._fbq) window._fbq=n;
      n.push=n; n.loaded=true; n.version='2.0'; n.queue=[];
      const script=document.createElement('script');script.async=true;script.src='https://connect.facebook.net/en_US/fbevents.js';document.head.appendChild(script);
    }
    window.fbq('consent','grant');
    window.fbq('set','autoConfig',false,id);
    window.fbq('init',id);
    window.fbq('trackSingle',id,'PageView');
  }
  consent.addEventListener('change',()=>{if(consent.checked)pixel();else if(window.fbq)window.fbq('consent','revoke');});
  function setType(value) {
    if (!['residential','commercial'].includes(value)) return;
    form.querySelector(`input[name="type"][value="${value}"]`).checked=true;
  }
  setType(params.get('type'));
  document.querySelectorAll('[data-type]').forEach(link=>link.addEventListener('click',()=>setType(link.dataset.type)));
  document.querySelectorAll('a[href^="tel:"]').forEach(link=>link.addEventListener('click',()=>{
    if(consent.checked && window.fbq)window.fbq('trackSingleCustom',id,'PhoneClick',{content_name:'Cleaning quote'});
  }));
  function cookie(name) { const item=document.cookie.split('; ').find(value=>value.startsWith(`${name}=`)); return item ? item.slice(name.length+1) : ''; }
  form.addEventListener('submit',async event=>{
    event.preventDefault();
    if(button.disabled || !form.reportValidity())return;
    const phone=form.elements.phone.value.replace(/\D/g,'').replace(/^1(?=\d{10}$)/,'');
    if(!/^[2-9]\d{2}[2-9]\d{6}$/.test(phone)) { form.elements.phone.setCustomValidity('Enter a valid 10-digit US phone number.');form.elements.phone.reportValidity();return; }
    const data=Object.fromEntries(new FormData(form));
    const measurement=consent.checked;
    data.measurement=measurement;
    for(const key of ['utm_source','utm_medium','utm_campaign','utm_content'])data[key]=(params.get(key)||'').slice(0,100);
    if(measurement){
      pixel(); data.fbp=cookie('_fbp');data.fbc=cookie('_fbc');
      const click=params.get('fbclid');
      if(click && /^[A-Za-z0-9_-]{1,400}$/.test(click))data.fbc=`fb.1.${Date.now()}.${click}`;
    }
    button.disabled=true;button.textContent='Sending your request…';status.textContent='';status.className='';
    try {
      const response=await fetch('/api/cleaning-lead',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data),signal:AbortSignal.timeout(25000)});
      const result=await response.json();
      if(!response.ok || !result.success || !result.event_id)throw new Error(result.message || 'We could not confirm your request. Please call 843-467-7136.');
      // Match the server event ID so browser + server are deduplicated.
      if(measurement && consent.checked && window.fbq) {
        try { window.fbq('trackSingle',id,'Lead',{content_name:'Cleaning quote',content_category:data.type},{eventID:result.event_id}); } catch { /* Quote success never depends on tracking. */ }
      }
      status.className='success';status.textContent='Thank you! Your cleaning request has been submitted. Bakerss will contact you to discuss your quote. Prefer to talk now? Call 843-467-7136.';
      form.querySelectorAll('input,select,textarea').forEach(el=>el.disabled=true);
      button.textContent='Request submitted ✓';status.focus();
    } catch(error) {
      status.className='error';status.textContent=error.name==='TimeoutError' || error.name==='AbortError' ? 'We could not confirm your request. Please call 843-467-7136 before resubmitting.' : (error.message || 'We could not confirm your request. Please call 843-467-7136.');
      button.disabled=false;button.textContent='Request my cleaning quote ↗';status.focus();
    }
  });
  form.elements.phone.addEventListener('input',()=>form.elements.phone.setCustomValidity(''));
})();
