/* Partner portal — registration, phone-OTP sign-in, product & enquiry management. */
(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  const money = (v) => '₹' + Number(v || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });

  let ME = null, FBCFG = null, CONFIRMATION = null, PENDING_PHONE = '';

  const views = ['viewAuth', 'viewRegister', 'viewOtp', 'viewPending', 'viewDash'];
  function show(id) { views.forEach(v => { const el = $('#' + v); if (el) el.hidden = v !== id; }); window.scrollTo(0, 0); }
  function toast(m) { const t = $('#toast'); t.textContent = m; t.classList.add('show'); clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('show'), 2400); }

  async function api(path, opts = {}) {
    const res = await fetch(path, {
      headers: opts.body && !(opts.body instanceof FormData) ? { 'Content-Type': 'application/json' } : undefined,
      ...opts,
    });
    let data = {}; try { data = await res.json(); } catch {}
    if (!res.ok) { const e = new Error(data.error || 'Request failed'); e.data = data; throw e; }
    return data;
  }

  // ---------------- Firebase phone auth ----------------
  async function loadFirebase() {
    if (!FBCFG) {
      const site = await api('/api/public/site');
      FBCFG = site.firebase_config;
      if (!FBCFG || !FBCFG.apiKey) throw new Error('Phone sign-in is not configured yet. Please contact us.');
    }
    if (window.firebase && window.firebase.apps && window.firebase.apps.length) return window.firebase.auth();
    const add = (src) => new Promise((res, rej) => {
      const s = document.createElement('script'); s.src = src; s.onload = res;
      s.onerror = () => rej(new Error('Could not load sign-in. Check your connection.'));
      document.head.appendChild(s);
    });
    const base = 'https://www.gstatic.com/firebasejs/10.12.2/';
    await add(base + 'firebase-app-compat.js');
    await add(base + 'firebase-auth-compat.js');
    window.firebase.initializeApp(FBCFG);
    const auth = window.firebase.auth();
    try { auth.useDeviceLanguage(); } catch {}
    return auth;
  }
  function recaptcha(auth) {
    if (window._vRecaptcha) return window._vRecaptcha;
    window._vRecaptcha = new window.firebase.auth.RecaptchaVerifier('fbRecaptcha', { size: 'invisible' }, auth);
    return window._vRecaptcha;
  }
  function resetRecaptcha() { try { if (window._vRecaptcha) { window._vRecaptcha.clear(); window._vRecaptcha = null; } } catch {} }
  function fbErr(e) {
    const c = (e && e.code) || '';
    if (c === 'auth/invalid-verification-code') return 'Incorrect code — please try again.';
    if (c === 'auth/code-expired') return 'Code expired — request a new one.';
    if (c === 'auth/too-many-requests') return 'Too many attempts. Please wait and try again.';
    if (c === 'auth/invalid-phone-number') return 'That mobile number looks invalid.';
    return (e && e.message) || 'Something went wrong.';
  }

  async function sendOtp(digits, msgEl, btn) {
    msgEl.textContent = ''; msgEl.className = 'v-msg err';
    if (!/^[6-9]\d{9}$/.test(digits)) { msgEl.textContent = 'Enter a valid 10-digit Indian mobile number.'; return; }
    const label = btn.textContent; btn.disabled = true; btn.textContent = 'Sending…';
    try {
      const auth = await loadFirebase();
      CONFIRMATION = await auth.signInWithPhoneNumber('+91' + digits, recaptcha(auth));
      PENDING_PHONE = '+91 ' + digits;
      $('#otpPhone').textContent = PENDING_PHONE;
      $$('#otpBoxes .otp-box').forEach(b => b.value = '');
      $('#otpMsg').textContent = '';
      show('viewOtp');
      setTimeout(() => $$('#otpBoxes .otp-box')[0].focus(), 80);
    } catch (e) { resetRecaptcha(); msgEl.textContent = fbErr(e); }
    finally { btn.disabled = false; btn.textContent = label; }
  }

  // ---------------- boot ----------------
  async function boot() {
    try {
      const me = await api('/api/vendor/me');
      if (me.authenticated) return enter(me.vendor, me.stats);
    } catch {}
    show('viewAuth');
  }
  function enter(vendor, stats) {
    ME = vendor;
    $('#vWho').textContent = vendor.company_name; $('#vWho').hidden = false;
    $('#vLogout').hidden = false;
    if (vendor.status !== 'approved') return show('viewPending');
    $('#dashCompany').textContent = vendor.company_name;
    $('#dashMeta').textContent = [vendor.city, vendor.state].filter(Boolean).join(', ')
      + (vendor.sku_prefix ? ' · SKU prefix ' + vendor.sku_prefix : '');
    renderStats(stats);
    show('viewDash');
    loadProducts();
    loadEnquiries();
    renderProfile();
  }
  function renderStats(s) {
    if (!s) return;
    $('#dashStats').innerHTML = `
      <div class="v-stat"><b>${s.products_live}</b><span>Live listings</span></div>
      <div class="v-stat"><b>${s.products_pending}</b><span>Under review</span></div>
      <div class="v-stat"><b>${s.enquiries}</b><span>Total enquiries</span></div>
      <div class="v-stat"><b>${s.enquiries_new}</b><span>New enquiries</span></div>`;
    const badge = $('#enqBadge');
    badge.textContent = s.enquiries_new; badge.hidden = !s.enquiries_new;
  }
  async function refreshStats() {
    try { const me = await api('/api/vendor/me'); if (me.authenticated) renderStats(me.stats); } catch {}
  }

  // ---------------- auth wiring ----------------
  const loginPhone = $('#loginPhone');
  loginPhone.addEventListener('input', () => loginPhone.value = loginPhone.value.replace(/\D/g, '').slice(0, 10));
  $('#loginBtn').addEventListener('click', () => sendOtp(loginPhone.value, $('#loginMsg'), $('#loginBtn')));
  loginPhone.addEventListener('keydown', e => { if (e.key === 'Enter') $('#loginBtn').click(); });

  const boxes = $$('#otpBoxes .otp-box');
  boxes.forEach((b, i) => {
    b.addEventListener('input', () => { b.value = b.value.replace(/\D/g, '').slice(0, 1); if (b.value && boxes[i + 1]) boxes[i + 1].focus(); });
    b.addEventListener('keydown', e => {
      if (e.key === 'Backspace' && !b.value && boxes[i - 1]) boxes[i - 1].focus();
      if (e.key === 'Enter') $('#otpVerify').click();
    });
    b.addEventListener('paste', e => {
      const t = (e.clipboardData.getData('text') || '').replace(/\D/g, '').slice(0, 6);
      if (t) { e.preventDefault(); t.split('').forEach((c, j) => { if (boxes[j]) boxes[j].value = c; }); boxes[Math.min(t.length, 5)].focus(); }
    });
  });
  $('#otpBack').addEventListener('click', () => { resetRecaptcha(); show('viewAuth'); });
  $('#otpVerify').addEventListener('click', async () => {
    const msg = $('#otpMsg'); msg.textContent = '';
    const code = boxes.map(b => b.value).join('');
    if (code.length !== 6) { msg.textContent = 'Enter the 6-digit code.'; return; }
    const btn = $('#otpVerify'); btn.disabled = true; btn.textContent = 'Verifying…';
    try {
      const cred = await CONFIRMATION.confirm(code);
      const idToken = await cred.user.getIdToken();
      const r = await api('/api/vendor/login', { method: 'POST', body: JSON.stringify({ idToken }) });
      resetRecaptcha();
      const me = await api('/api/vendor/me');
      enter(r.vendor, me.stats);
      toast('Signed in');
    } catch (e) {
      if (e.data && e.data.unregistered) {
        msg.innerHTML = 'This number is not registered yet.';
        setTimeout(() => { show('viewRegister'); $('#rPhone').value = PENDING_PHONE.replace(/\D/g, '').slice(-10); }, 900);
      } else msg.textContent = fbErr(e);
      btn.disabled = false; btn.textContent = 'Verify & Sign In';
    }
  });
  $('#vLogout').addEventListener('click', async () => {
    try { await api('/api/vendor/logout', { method: 'POST' }); } catch {}
    location.reload();
  });

  // ---------------- registration ----------------
  $('#showRegister').addEventListener('click', () => show('viewRegister'));
  $('#regBack').addEventListener('click', () => show('viewAuth'));
  const rPhone = $('#rPhone');
  rPhone.addEventListener('input', () => rPhone.value = rPhone.value.replace(/\D/g, '').slice(0, 10));
  $('#regSubmit').addEventListener('click', async () => {
    const msg = $('#regMsg'); msg.className = 'v-msg err'; msg.textContent = '';
    const val = (id) => $('#' + id).value.trim();
    if (!val('rCompany')) return msg.textContent = 'Company name is required.';
    if (!val('rContact')) return msg.textContent = 'Contact person is required.';
    if (!/^[6-9]\d{9}$/.test(val('rPhone'))) return msg.textContent = 'Enter a valid 10-digit mobile number.';
    if (!val('rCategories')) return msg.textContent = 'Please tell us what you sell.';
    if (!$('#rAgree').checked) return msg.textContent = 'Please accept the Partner Terms to continue.';
    const btn = $('#regSubmit'); btn.disabled = true; btn.textContent = 'Submitting…';
    try {
      await api('/api/vendor/register', { method: 'POST', body: JSON.stringify({
        company_name: val('rCompany'), gst: val('rGst'), categories: val('rCategories'),
        description: val('rDesc'), contact_name: val('rContact'), phone: '+91' + val('rPhone'),
        email: val('rEmail'), website: val('rWebsite'), address: val('rAddress'),
        city: val('rCity'), state: val('rState'), pincode: val('rPin'),
      }) });
      show('viewPending');
      toast('Application submitted');
    } catch (e) { msg.textContent = e.message; }
    finally { btn.disabled = false; btn.textContent = 'Submit Application'; }
  });

  // ---------------- tabs ----------------
  $$('.v-tab').forEach(t => t.addEventListener('click', () => {
    $$('.v-tab').forEach(x => x.classList.remove('on')); t.classList.add('on');
    const tab = t.dataset.tab;
    $('#tabProducts').hidden = tab !== 'products';
    $('#tabEnquiries').hidden = tab !== 'enquiries';
    $('#tabProfile').hidden = tab !== 'profile';
  }));

  // ---------------- products ----------------
  const statusPill = (s) => s === 'approved' ? '<span class="v-pill v-pill--live">Live</span>'
    : s === 'rejected' ? '<span class="v-pill v-pill--rejected">Rejected</span>'
    : '<span class="v-pill v-pill--pending">Under review</span>';

  async function loadProducts() {
    const wrap = $('#tabProducts');
    wrap.innerHTML = '<p class="v-muted">Loading…</p>';
    try {
      const list = await api('/api/vendor/products');
      if (!list.length) {
        wrap.innerHTML = `<div class="v-empty">No products yet.<br><br>
          <button class="btn btn--sm" id="emptyAdd">+ Add your first product</button></div>`;
        $('#emptyAdd').addEventListener('click', () => productModal());
        return;
      }
      wrap.innerHTML = list.map(p => `
        <div class="v-row">
          ${p.images && p.images[0] ? `<img class="v-row__img" src="${esc(p.images[0])}" alt="">`
            : '<div class="v-row__img"></div>'}
          <div class="v-row__main">
            <h4>${esc(p.name)}</h4>
            <div class="v-row__meta">${esc(p.sku)} · ${esc(p.category || 'Uncategorised')}
              ${p.price > 0 ? ' · ' + money(p.price) + ' / ' + esc(p.unit) : ' · Price on request'}</div>
            <div class="v-row__actions">
              <button class="btn btn--ghost btn--sm" data-edit="${esc(p.id)}">Edit</button>
              <button class="btn btn--ghost btn--sm" data-del="${esc(p.id)}">Delete</button>
            </div>
          </div>
          <div class="v-row__side">${statusPill(p.status)}</div>
        </div>`).join('');
      wrap.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () =>
        productModal(list.find(x => x.id === b.dataset.edit))));
      wrap.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', async () => {
        if (!confirm('Delete this product? This cannot be undone.')) return;
        try { await api('/api/vendor/products/' + b.dataset.del, { method: 'DELETE' }); toast('Deleted'); loadProducts(); refreshStats(); }
        catch (e) { toast(e.message); }
      }));
    } catch (e) { wrap.innerHTML = `<p class="v-msg err">${esc(e.message)}</p>`; }
  }

  $('#addProductBtn').addEventListener('click', () => productModal());

  function productModal(p) {
    const editing = !!p;
    let images = p && Array.isArray(p.images) ? [...p.images] : [];
    const f = (id, v) => `value="${esc(v || '')}"`;
    const html = `
      <div class="v-overlay">
        <div class="v-modal">
          <div class="v-modal__head">
            <h3>${editing ? 'Edit Product' : 'Add Product'}</h3>
            <button class="v-x">&times;</button>
          </div>
          ${editing ? '<p class="v-muted" style="margin-bottom:1rem">Editing a live listing sends it back for review.</p>' : ''}
          <div class="field"><label>Product Name *</label><input id="pName" maxlength="140" ${f('', p && p.name)}></div>
          <div class="v-grid2">
            <div class="field"><label>Category</label><input id="pCat" maxlength="80" placeholder="e.g. Gill Nets" ${f('', p && p.category)}></div>
            <div class="field"><label>Material</label><input id="pMat" maxlength="80" placeholder="e.g. Nylon" ${f('', p && p.material)}></div>
          </div>
          <div class="field"><label>Description</label><textarea id="pDesc" rows="3" maxlength="1500">${esc(p && p.description || '')}</textarea></div>
          <div class="v-grid3">
            <div class="field"><label>Price (₹)</label><input id="pPrice" inputmode="decimal" ${f('', p && p.price)}></div>
            <div class="field"><label>Unit</label><input id="pUnit" maxlength="20" ${f('', (p && p.unit) || 'kg')}></div>
            <div class="field"><label>Min. Order</label><input id="pMoq" inputmode="numeric" ${f('', (p && p.moq) || 1)}></div>
          </div>
          <div class="v-grid3">
            <div class="field"><label>Size</label><input id="pSize" maxlength="80" ${f('', p && p.size)}></div>
            <div class="field"><label>Mesh Size</label><input id="pMesh" maxlength="80" ${f('', p && p.mesh_size)}></div>
            <div class="field"><label>MD Size</label><input id="pMd" maxlength="80" ${f('', p && p.md_size)}></div>
          </div>
          <div class="v-grid2">
            <div class="field"><label>Colour</label><input id="pColor" maxlength="80" ${f('', p && p.color)}></div>
            <div class="field"><label>Availability</label>
              <select id="pStock">
                <option value="in_stock">In stock</option>
                <option value="low_stock">Limited stock</option>
                <option value="made_to_order">Made to order</option>
                <option value="out_of_stock">Out of stock</option>
              </select></div>
          </div>
          <label class="v-label">Photos (up to 8)</label>
          <div class="v-drop" id="pDrop">Tap to upload photos</div>
          <input type="file" id="pFile" accept="image/*" multiple hidden>
          <div class="v-thumbs" id="pThumbs"></div>
          <p class="v-msg err" id="pMsg"></p>
          <button class="btn btn--block" id="pSave" style="margin-top:12px">${editing ? 'Save Changes' : 'Add Product'}</button>
        </div>
      </div>`;
    $('#vModal').innerHTML = html;
    document.body.style.overflow = 'hidden';
    const close = () => { $('#vModal').innerHTML = ''; document.body.style.overflow = ''; };
    $('#vModal .v-x').addEventListener('click', close);
    $('#vModal .v-overlay').addEventListener('click', e => { if (e.target.classList.contains('v-overlay')) close(); });
    if (p && p.stock_status) $('#pStock').value = p.stock_status;

    function drawThumbs() {
      $('#pThumbs').innerHTML = images.map((u, i) =>
        `<div class="v-thumb"><img src="${esc(u)}"><button data-i="${i}">&times;</button></div>`).join('');
      $$('#pThumbs button').forEach(b => b.addEventListener('click', () => { images.splice(Number(b.dataset.i), 1); drawThumbs(); }));
    }
    drawThumbs();
    $('#pDrop').addEventListener('click', () => $('#pFile').click());
    $('#pFile').addEventListener('change', async (e) => {
      const files = [...e.target.files].slice(0, 8 - images.length);
      if (!files.length) return;
      const drop = $('#pDrop'); drop.textContent = 'Uploading…';
      try {
        const fd = new FormData(); files.forEach(f => fd.append('images', f));
        const r = await api('/api/vendor/upload', { method: 'POST', body: fd });
        images = images.concat(r.urls || []).slice(0, 8);
        drawThumbs();
      } catch (err) { $('#pMsg').textContent = err.message; }
      finally { drop.textContent = 'Tap to upload photos'; e.target.value = ''; }
    });

    $('#pSave').addEventListener('click', async () => {
      const msg = $('#pMsg'); msg.textContent = '';
      const v = (id) => $('#' + id).value.trim();
      if (!v('pName')) return msg.textContent = 'Product name is required.';
      const body = {
        name: v('pName'), category: v('pCat'), material: v('pMat'), description: v('pDesc'),
        price: Number(v('pPrice')) || 0, unit: v('pUnit') || 'kg', moq: Number(v('pMoq')) || 1,
        size: v('pSize'), mesh_size: v('pMesh'), md_size: v('pMd'), color: v('pColor'),
        stock_status: $('#pStock').value, images,
      };
      const btn = $('#pSave'); btn.disabled = true; btn.textContent = 'Saving…';
      try {
        if (editing) await api('/api/vendor/products/' + p.id, { method: 'PUT', body: JSON.stringify(body) });
        else await api('/api/vendor/products', { method: 'POST', body: JSON.stringify(body) });
        close(); toast(editing ? 'Saved — sent for review' : 'Added — sent for review');
        loadProducts(); refreshStats();
      } catch (e) { msg.textContent = e.message; btn.disabled = false; btn.textContent = editing ? 'Save Changes' : 'Add Product'; }
    });
  }

  // ---------------- enquiries ----------------
  async function loadEnquiries() {
    const wrap = $('#tabEnquiries');
    wrap.innerHTML = '<p class="v-muted">Loading…</p>';
    try {
      const list = await api('/api/vendor/enquiries');
      if (!list.length) { wrap.innerHTML = '<div class="v-empty">No enquiries yet. They will appear here as buyers contact you.</div>'; return; }
      wrap.innerHTML = list.map(e => `
        <div class="v-row">
          <div class="v-row__main">
            <h4>${esc(e.name)}${e.company ? ' — ' + esc(e.company) : ''}
              ${e.status === 'new' ? '<span class="v-pill v-pill--new">New</span>' : ''}</h4>
            <div class="v-row__meta">
              ${e.product_name ? '<strong>' + esc(e.product_name) + '</strong> · ' : ''}${e.quantity} ${esc(e.unit)}<br>
              📞 <a href="tel:${esc(e.phone)}">${esc(e.phone)}</a>
              ${e.email ? ' · ✉ <a href="mailto:' + esc(e.email) + '">' + esc(e.email) + '</a>' : ''}<br>
              ${e.message ? esc(e.message) + '<br>' : ''}
              <small>${(e.created_at || '').replace('T', ' ').slice(0, 16)}</small>
            </div>
            <div class="v-row__actions">
              <a class="btn btn--sm" href="tel:${esc(e.phone)}">Call</a>
              <a class="btn btn--ghost btn--sm" target="_blank"
                 href="https://wa.me/91${esc(String(e.phone).replace(/\D/g,'').slice(-10))}">WhatsApp</a>
              <select class="v-estatus" data-id="${esc(e.id)}">
                ${['new','contacted','quoted','closed'].map(s =>
                  `<option value="${s}"${e.status === s ? ' selected' : ''}>${s[0].toUpperCase() + s.slice(1)}</option>`).join('')}
              </select>
            </div>
          </div>
        </div>`).join('');
      wrap.querySelectorAll('.v-estatus').forEach(sel => sel.addEventListener('change', async () => {
        try { await api('/api/vendor/enquiries/' + sel.dataset.id, { method: 'PUT', body: JSON.stringify({ status: sel.value }) });
          toast('Updated'); refreshStats(); } catch (e) { toast(e.message); }
      }));
    } catch (e) { wrap.innerHTML = `<p class="v-msg err">${esc(e.message)}</p>`; }
  }

  // ---------------- profile ----------------
  function renderProfile() {
    if (!ME) return;
    const f = (v) => esc(v || '');
    $('#tabProfile').innerHTML = `
      <div class="v-card v-card--wide">
        <div class="v-grid2">
          <div class="field"><label>Company Name</label><input id="fCompany" value="${f(ME.company_name)}"></div>
          <div class="field"><label>GST Number</label><input id="fGst" value="${f(ME.gst)}"></div>
        </div>
        <div class="field"><label>What you sell</label><input id="fCats" value="${f(ME.categories)}"></div>
        <div class="field"><label>About</label><textarea id="fDesc" rows="3">${f(ME.description)}</textarea></div>
        <div class="v-grid2">
          <div class="field"><label>Contact Person</label><input id="fContact" value="${f(ME.contact_name)}"></div>
          <div class="field"><label>Email</label><input id="fEmail" value="${f(ME.email)}"></div>
        </div>
        <div class="field"><label>Address</label><textarea id="fAddr" rows="2">${f(ME.address)}</textarea></div>
        <div class="v-grid3">
          <div class="field"><label>City</label><input id="fCity" value="${f(ME.city)}"></div>
          <div class="field"><label>State</label><input id="fState" value="${f(ME.state)}"></div>
          <div class="field"><label>PIN</label><input id="fPin" value="${f(ME.pincode)}"></div>
        </div>
        <div class="field"><label>Website</label><input id="fWeb" value="${f(ME.website)}"></div>
        <p class="v-muted">Mobile number (${f(ME.phone)}) is your login and cannot be changed here —
           contact us if it needs updating.</p>
        <p class="v-msg" id="fMsg"></p>
        <button class="btn" id="fSave" style="margin-top:10px">Save Profile</button>
      </div>`;
    $('#fSave').addEventListener('click', async () => {
      const msg = $('#fMsg'); msg.className = 'v-msg'; msg.textContent = '';
      const v = (id) => $('#' + id).value.trim();
      const btn = $('#fSave'); btn.disabled = true; btn.textContent = 'Saving…';
      try {
        const r = await api('/api/vendor/profile', { method: 'PUT', body: JSON.stringify({
          company_name: v('fCompany'), gst: v('fGst'), categories: v('fCats'), description: v('fDesc'),
          contact_name: v('fContact'), email: v('fEmail'), address: v('fAddr'),
          city: v('fCity'), state: v('fState'), pincode: v('fPin'), website: v('fWeb'),
        }) });
        ME = r.vendor;
        $('#vWho').textContent = ME.company_name; $('#dashCompany').textContent = ME.company_name;
        msg.className = 'v-msg ok'; msg.textContent = 'Saved.';
      } catch (e) { msg.className = 'v-msg err'; msg.textContent = e.message; }
      finally { btn.disabled = false; btn.textContent = 'Save Profile'; }
    });
  }

  boot();
})();
