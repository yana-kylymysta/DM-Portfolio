/* ═══════════════════════════════════════════════════
   CONTACT FORM — inline validation + Formspree async submit
   ═══════════════════════════════════════════════════ */
(function initContactForm() {
  const form      = document.getElementById('contact-form');
  const submitBtn = document.getElementById('contact-form-submit');
  const successEl = document.getElementById('contact-form-success');
  if (!form || !submitBtn) return;

  const arrowIcon = submitBtn.querySelector('.contact-form-submit-arrow');
  const checkIcon = submitBtn.querySelector('.contact-form-submit-check');
  const labelEl   = submitBtn.querySelector('.contact-form-submit-text');

  // RFC-5322 simplified — sufficient for client-side gate
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  // Field registry
  const fields = ['name', 'email', 'msg'].map(function(key) {
    const input = form.querySelector('#cf-' + key);
    if (!input) return null;
    const field = input.closest('.contact-form-field');
    if (!field) return null;
    const err   = document.createElement('span');
    err.className = 'contact-form-error';
    err.id = 'cf-' + key + '-error';
    err.setAttribute('role', 'alert');
    field.appendChild(err);
    input.setAttribute('aria-describedby', err.id);

    const entry = { key: key, input: input, field: field, errorEl: err };

    // Clear error as soon as user starts correcting
    input.addEventListener('input', function() {
      if (field.classList.contains('has-error')) clearError(entry);
    });

    // Expand hit-zone — clicking anywhere in the bordered wrapper focuses the input.
    // Native <label for=""> behavior already covers label clicks; we just patch the
    // padding/gap dead-space between border and input.
    field.addEventListener('mousedown', function(e) {
      if (e.target === field) {
        e.preventDefault();          // keep selection/caret intent stable
        input.focus();
      }
    });

    return entry;
  }).filter(Boolean);

  const byKey = fields.reduce(function(acc, f) { acc[f.key] = f; return acc; }, {});

  function showError(f, msg) {
    f.field.classList.add('has-error');
    f.errorEl.textContent = msg;
    f.input.setAttribute('aria-invalid', 'true');
  }
  function clearError(f) {
    f.field.classList.remove('has-error');
    f.errorEl.textContent = '';
    f.input.removeAttribute('aria-invalid');
  }

  function validate() {
    let ok = true;
    const nameVal  = byKey.name.input.value.trim();
    const emailVal = byKey.email.input.value.trim();
    const msgVal   = byKey.msg.input.value.trim();

    if (!nameVal) { showError(byKey.name, 'Name is required'); ok = false; }
    else clearError(byKey.name);

    if (!emailVal) { showError(byKey.email, 'Email is required'); ok = false; }
    else if (!EMAIL_RE.test(emailVal)) { showError(byKey.email, 'Enter a valid email'); ok = false; }
    else clearError(byKey.email);

    if (!msgVal) { showError(byKey.msg, 'Message is required'); ok = false; }
    else clearError(byKey.msg);

    if (!ok) {
      const firstErr = form.querySelector('.has-error .contact-form-input');
      if (firstErr) firstErr.focus();
    }
    return ok;
  }

  form.addEventListener('submit', function(e) {
    e.preventDefault();
    if (submitBtn.disabled) return;          // double-submit guard
    if (!validate()) return;

    // Loading state
    submitBtn.disabled = true;
    labelEl.textContent = 'Sending...';
    successEl.style.color = '';              // reset any previous error tint

    const data = new FormData(form);

    fetch(form.action, {
      method: 'POST',
      body: data,
      headers: { 'Accept': 'application/json' }
    })
    .then(function(res) {
      if (res.ok) {
        // Success state
        labelEl.textContent = 'Sent';
        if (arrowIcon) arrowIcon.style.display = 'none';
        if (checkIcon) checkIcon.style.display = 'block';
        submitBtn.classList.add('sent');
        successEl.style.color = '';          // → default --accent-2 (blue)
        successEl.textContent = 'Message received — I\'ll get back to you within 24 hours.';

        // Reset after 5 seconds
        setTimeout(function() {
          form.reset();
          labelEl.textContent = 'Send Message';
          if (arrowIcon) arrowIcon.style.display = 'block';
          if (checkIcon) checkIcon.style.display = 'none';
          submitBtn.classList.remove('sent');
          submitBtn.disabled = false;
          successEl.textContent = '';
        }, 5000);
      } else {
        res.json().then(function(data) {
          const errMsg = (data && data.errors)
            ? data.errors.map(function(e) { return e.message; }).join(', ')
            : 'Something went wrong. Please try again.';
          successEl.style.color = 'var(--accent)';
          successEl.textContent = errMsg;
          labelEl.textContent = 'Send Message';
          submitBtn.disabled = false;
        });
      }
    })
    .catch(function() {
      successEl.style.color = 'var(--accent)';
      labelEl.textContent = 'Send Message';
      submitBtn.disabled = false;
    });
  });
})();
