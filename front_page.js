/* ═══════════════════════════════════════════════════════════════════
   PMEC Hostel Portal — front_page.js
   Design: matches admin2.js patterns & conventions
   ═══════════════════════════════════════════════════════════════════ */

// ─────────────────────────────────────────────────────
// CONFIGURATION
// ─────────────────────────────────────────────────────

// BACKEND INTEGRATION:
// Change this URL if your backend API endpoint differs.
// %%"New Connection"%% — Pointing to our new hostel API
const API_HOSTELS = 'https://mess-management-backend-zeda.onrender.com/api/hostels';

// Breakpoint for mobile/desktop switch
const MOBILE_BP = 768;


// ─────────────────────────────────────────────────────
// STATE
// ─────────────────────────────────────────────────────
let hostels = [];
let currentSlide = 0;
let isMobile = window.innerWidth <= MOBILE_BP;


// ─────────────────────────────────────────────────────
// DOM REFS
// ─────────────────────────────────────────────────────
const sliderWrapper  = document.getElementById('sliderWrapper');
const sliderTrack    = document.getElementById('sliderTrack');
const sliderPrev     = document.getElementById('sliderPrev');
const sliderNext     = document.getElementById('sliderNext');
const sliderDots     = document.getElementById('sliderDots');
const mobileCards    = document.getElementById('mobileCards');
const loadingEl      = document.getElementById('hostelsLoading');
const errorEl        = document.getElementById('hostelsError');
const errorMsg       = document.getElementById('errorMsg');
const statHostels    = document.getElementById('statHostels');
const hamburgerBtn   = document.getElementById('hamburgerBtn');
const mobileDropdown = document.getElementById('mobileDropdown');


// ─────────────────────────────────────────────────────
// THEME TOGGLE (same as admin2.js — cookie persistence)
// ─────────────────────────────────────────────────────
function toggleTheme() {
  document.documentElement.classList.toggle("dark");
  const isDark = document.documentElement.classList.contains("dark");
  document.cookie = "theme=" + (isDark ? "dark" : "light") + ";path=/;max-age=" + (365*24*60*60);
}


// ─────────────────────────────────────────────────────
// TOAST (same as admin2.js)
// ─────────────────────────────────────────────────────
function toast(msg, type = 'success') {
  const container = document.getElementById('toast-container');
  const t = document.createElement('div');
  t.className = 'toast ' + type;
  t.textContent = msg;
  container.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .3s'; setTimeout(() => t.remove(), 300); }, 3000);
}


// ─────────────────────────────────────────────────────
// HAMBURGER MENU
// ─────────────────────────────────────────────────────
hamburgerBtn.addEventListener('click', () => {
  mobileDropdown.classList.toggle('open');
});
document.querySelectorAll('.mobile-link').forEach(link => {
  link.addEventListener('click', () => mobileDropdown.classList.remove('open'));
});


// ─────────────────────────────────────────────────────
// FETCH HOSTELS
// ─────────────────────────────────────────────────────

/**
 * BACKEND INTEGRATION:
 * Fetches all hostels from the backend.
 * Expected response: Array of hostel objects.
 *
 * Each hostel must have:
 *   - _id or id        : unique identifier
 *   - name             : string
 *   - description      : string
 *   - wardens          : array of { name, phone }
 *   - caretakers       : array of { name, phone }
 *   - messVendor       : { name, phone }
 *   - menuImage        : string (URL/path to menu image)
 */
async function loadHostels() {
  loadingEl.style.display = '';
  errorEl.style.display = 'none';
  sliderWrapper.style.display = 'none';
  mobileCards.style.display = 'none';

  try {
    const res = await fetch(API_HOSTELS);
    if (!res.ok) throw new Error('Server status ' + res.status);

    hostels = await res.json();
    // BACKEND NOTE: If API wraps data, e.g. { data: [...] }, change above to:
    // hostels = (await res.json()).data;

    if (!Array.isArray(hostels) || !hostels.length) {
      showError('No hostels found.');
      return;
    }

    statHostels.textContent = hostels.length;
    renderHostels();

  } catch (err) {
    console.error('loadHostels failed:', err);
    showError('Could not load hostels. Make sure the backend is running.');
  } finally {
    loadingEl.style.display = 'none';
  }
}

function showError(msg) {
  loadingEl.style.display = 'none';
  errorMsg.textContent = msg;
  errorEl.style.display = '';
}


// ─────────────────────────────────────────────────────
// RENDER CARDS
// ─────────────────────────────────────────────────────
function renderHostels() {
  const html = hostels.map((h, i) => buildCard(h, i)).join('');
  if (isMobile) {
    sliderWrapper.style.display = 'none';
    mobileCards.style.display = '';
    mobileCards.innerHTML = html;
  } else {
    mobileCards.style.display = 'none';
    sliderWrapper.style.display = '';
    sliderTrack.innerHTML = html;
    buildDots();
    updateSlider();
  }
}


// ─────────────────────────────────────────────────────
// BUILD CARD HTML
// ─────────────────────────────────────────────────────

/**
 * BACKEND NOTE:
 * Each hostel must include: warden, caretaker, vendor, image
 * Adapted to flat string fields from our Hostel model.
 */
function buildCard(h, idx) {
  const id = h._id || h.id || idx;

  // --- Wardens (array of { name, phone }) ---
  const wardensArr = h.wardens || [];
  const wardensHTML = wardensArr.length > 0
    ? wardensArr.map(w => `
    <div class="card-person">
      <div class="person-avatar">${esc(w.name || '?')[0].toUpperCase()}</div>
      <div class="person-info">
        <div class="person-name">${esc(w.name || '—')}</div>
        <div class="person-phone">${esc(w.phone || '—')}</div>
      </div>
    </div>`).join('')
    : '';

  // --- Caretakers (array of { name, phone }) ---
  const caretakersArr = h.caretakers || [];
  const caretakersHTML = caretakersArr.length > 0
    ? caretakersArr.map(c => `
    <div class="card-person">
      <div class="person-avatar">${esc(c.name || '?')[0].toUpperCase()}</div>
      <div class="person-info">
        <div class="person-name">${esc(c.name || '—')}</div>
        <div class="person-phone">${esc(c.phone || '—')}</div>
      </div>
    </div>`).join('')
    : '';

  // --- Mess Vendor (object { name, phone }) ---
  const vendorName = h.messVendor?.name || '';
  const vendorPhone = h.messVendor?.phone || '—';

  // Safe non-negative capacity display
  const safeCapacity = Math.max(0, parseInt(h.capacity) || 0);

  return `
  <div class="hostel-card" style="animation-delay:${idx*0.08}s" data-id="${id}">
    <div class="card-head">
      <div class="card-hostel-name">${esc(h.name || 'Unnamed')}</div>
      <div class="card-hostel-desc">Capacity: ${safeCapacity} Students</div>
    </div>
    <div class="card-body">
      ${wardensHTML ? `<div class="card-info-section"><div class="card-info-label"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>Warden</div>${wardensHTML}</div>` : ''}
      ${caretakersHTML ? `<div class="card-info-section"><div class="card-info-label"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>Caretaker</div>${caretakersHTML}</div>` : ''}
      ${vendorName ? `<div class="card-info-section"><div class="card-info-label"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/></svg>Mess Vendor</div><div class="card-person"><div class="person-avatar">${vendorName[0].toUpperCase()}</div><div class="person-info"><div class="person-name">${esc(vendorName)}</div><div class="person-phone">${esc(vendorPhone)}</div></div></div></div>` : ''}
    </div>
    <div class="card-foot">
      <button class="btn-menu" onclick="openMenuModal('${id}','${esc(h.name || 'Hostel')}')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>
        View Mess Menu
      </button>
    </div>
  </div>`;
}


// ─────────────────────────────────────────────────────
// SLIDER LOGIC
// ─────────────────────────────────────────────────────
function buildDots() {
  if (!hostels.length) return;
  sliderDots.innerHTML = hostels.map((_, i) =>
    `<button class="slider-dot ${i===currentSlide?'active':''}" data-i="${i}"></button>`
  ).join('');
  sliderDots.querySelectorAll('.slider-dot').forEach(d => {
    d.addEventListener('click', () => { currentSlide = +d.dataset.i; updateSlider(); });
  });
}

function updateSlider() {
  if (!hostels.length) return;
  const card = sliderTrack.querySelector('.hostel-card');
  if (!card) return;
  const cardW = card.offsetWidth + 16; // gap
  const trackW = sliderTrack.parentElement.offsetWidth;
  const offset = (trackW/2) - (card.offsetWidth/2) - (currentSlide * cardW);
  sliderTrack.style.transform = `translateX(${offset}px)`;

  sliderDots.querySelectorAll('.slider-dot').forEach((d, i) => d.classList.toggle('active', i===currentSlide));
  sliderPrev.disabled = currentSlide === 0;
  sliderNext.disabled = currentSlide >= hostels.length - 1;
}

sliderPrev.addEventListener('click', () => { if (currentSlide > 0) { currentSlide--; updateSlider(); } });
sliderNext.addEventListener('click', () => { if (currentSlide < hostels.length-1) { currentSlide++; updateSlider(); } });

document.addEventListener('keydown', (e) => {
  if (isMobile) return;
  if (e.key==='ArrowLeft' && currentSlide>0) { currentSlide--; updateSlider(); }
  if (e.key==='ArrowRight' && currentSlide<hostels.length-1) { currentSlide++; updateSlider(); }
});


// ─────────────────────────────────────────────────────
// RESPONSIVE
// ─────────────────────────────────────────────────────
let resizeT;
window.addEventListener('resize', () => {
  clearTimeout(resizeT);
  resizeT = setTimeout(() => {
    const was = isMobile;
    isMobile = window.innerWidth <= MOBILE_BP;
    if (was !== isMobile && hostels.length) { currentSlide = 0; renderHostels(); }
    if (!isMobile && hostels.length) updateSlider();
  }, 150);
});


// ─────────────────────────────────────────────────────
// NOTICES & TICKER
// ─────────────────────────────────────────────────────
let cachedNotices = [];

async function loadTicker() {
  const trackEl = document.getElementById('tickerTrack');
  const loadingEl = document.getElementById('tickerLoading');
  const errorEl = document.getElementById('tickerError');
  if (!trackEl) return;

  try {
    const res = await fetch('https://mess-management-backend-zeda.onrender.com/api/notices');
    if (!res.ok) throw new Error('Status ' + res.status);
    const notices = await res.json();
    cachedNotices = Array.isArray(notices) ? notices : [];

    if (loadingEl) loadingEl.style.display = 'none';

    if (!cachedNotices.length) {
      if (errorEl) {
        errorEl.textContent = 'No current notices.';
        errorEl.style.display = 'flex';
      }
      return;
    }

    if (errorEl) errorEl.style.display = 'none';
    buildTicker(cachedNotices, trackEl);
  } catch (err) {
    console.warn('Ticker load error:', err);
    if (loadingEl) loadingEl.style.display = 'none';
    if (errorEl) {
      errorEl.textContent = 'Unable to load notices.';
      errorEl.style.display = 'flex';
    }
  }
}

function buildTicker(notices, trackEl) {
  trackEl.innerHTML = '';
  // Build items list
  const fragment = document.createDocumentFragment();

  // Create two copies for seamless infinite scroll
  for (let copy = 0; copy < 2; copy++) {
    notices.forEach((n, idx) => {
      const item = document.createElement('a');
      item.className = 'ticker-item';
      item.href = 'javascript:void(0)';
      item.onclick = () => openNoticesModal();
      item.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;color:var(--primary);flex-shrink:0"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        <span>${esc(n.title || 'Notice')}</span>
      `;
      fragment.appendChild(item);

      const sep = document.createElement('span');
      sep.className = 'ticker-sep';
      fragment.appendChild(sep);
    });
  }

  trackEl.appendChild(fragment);

  // Set animation duration based on notice count (min 15s, 6s per notice)
  const duration = Math.max(15, notices.length * 6);
  trackEl.style.setProperty('--ticker-duration', `${duration}s`);
}

async function openNoticesModal() {
  const overlay = document.getElementById('noticesModalOverlay');
  const bodyEl = document.getElementById('noticesModalBody');
  if (!overlay || !bodyEl) return;

  overlay.style.display = 'flex';
  // Must add .active AFTER display:flex so CSS transition works
  requestAnimationFrame(() => overlay.classList.add('active'));
  document.body.style.overflow = 'hidden';

  // If notices are not yet cached, fetch them
  if (!cachedNotices.length) {
    bodyEl.innerHTML = `
      <div class="state-msg" style="padding:30px 0">
        <div class="spinner"></div>
        <p>Loading notices...</p>
      </div>`;
    try {
      const res = await fetch('https://mess-management-backend-zeda.onrender.com/api/notices');
      if (res.ok) cachedNotices = await res.json();
    } catch (err) {
      console.error('Error fetching notices:', err);
    }
  }

  if (!cachedNotices || !cachedNotices.length) {
    bodyEl.innerHTML = `
      <div style="text-align:center;padding:30px 20px;color:var(--fg2)">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="width:40px;height:40px;margin-bottom:8px;opacity:0.6"><path d="M15 17h5l-1.405-1.405A2.032 2.032 0 0 1 18 14.158V11a6.002 6.002 0 0 0-4-5.659V5a2 2 0 1 0-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 1 1-6 0v-1m6 0H9"/></svg>
        <p style="font-size:14px;font-weight:500">No notices posted yet</p>
      </div>`;
    return;
  }

  bodyEl.innerHTML = cachedNotices.map((n, i) => {
    const dateStr = n.createdAt
      ? new Date(n.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
      : '';
    const hasPdf = !!n.pdfUrl;

    return `
    <div class="notice-card">
      <div class="notice-card-top">
        <span class="badge badge-green" style="font-size:11px">Circular #${cachedNotices.length - i}</span>
        ${dateStr ? `<span class="notice-date"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:12px;height:12px"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>${dateStr}</span>` : ''}
      </div>
      <div class="notice-title">${esc(n.title || '')}</div>
      ${hasPdf ? `
      <a href="${esc(n.pdfUrl)}" target="_blank" rel="noopener noreferrer" class="notice-link">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
        View / Download Attachment
      </a>` : ''}
    </div>`;
  }).join('');
}

function closeNoticesModal() {
  const overlay = document.getElementById('noticesModalOverlay');
  if (!overlay) return;
  overlay.classList.remove('active');
  // Wait for CSS transition to finish before hiding
  setTimeout(() => { overlay.style.display = 'none'; }, 200);
  document.body.style.overflow = '';
}

// ─────────────────────────────────────────────────────
// MENU MODAL
// ─────────────────────────────────────────────────────
async function openMenuModal(hostelId, hostelName) {
  const overlay  = document.getElementById('menuModalOverlay');
  const titleEl  = document.getElementById('menuModalTitle');
  const imgEl    = document.getElementById('menuImage');
  const loadEl   = document.getElementById('menuLoading');
  const errEl    = document.getElementById('menuError');
  if (!overlay) return;

  // Reset state
  if (titleEl)  titleEl.textContent = 'Mess Menu — ' + (hostelName || 'Hostel');
  if (imgEl)    { imgEl.style.display = 'none'; imgEl.src = ''; }
  if (loadEl)   loadEl.style.display = '';
  if (errEl)    errEl.style.display  = 'none';

  overlay.style.display = 'flex';
  requestAnimationFrame(() => overlay.classList.add('active'));
  document.body.style.overflow = 'hidden';

  try {
    const res = await fetch(`https://mess-management-backend-zeda.onrender.com/api/menu?hostel=${encodeURIComponent(hostelName || '')}`);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();

    if (data && data.menuImage) {
      const url = 'https://mess-management-backend-zeda.onrender.com' + data.menuImage;
      if (loadEl) loadEl.style.display = 'none';
      if (imgEl) {
        imgEl.src = url;
        imgEl.style.display = 'block';
        imgEl.onerror = () => {
          imgEl.style.display = 'none';
          if (errEl) errEl.style.display = 'block';
        };
      }
    } else {
      if (loadEl) loadEl.style.display = 'none';
      if (errEl)  errEl.style.display  = 'block';
    }
  } catch (err) {
    console.error('Menu load error:', err);
    if (loadEl) loadEl.style.display = 'none';
    if (errEl)  errEl.style.display  = 'block';
  }
}

function closeMenuModal() {
  const overlay = document.getElementById('menuModalOverlay');
  if (!overlay) return;
  overlay.classList.remove('active');
  setTimeout(() => { overlay.style.display = 'none'; }, 200);
  document.body.style.overflow = '';
}

// Wire up close buttons and backdrop click
document.addEventListener('DOMContentLoaded', () => {
  const menuClose   = document.getElementById('menuModalClose');
  const menuOverlay = document.getElementById('menuModalOverlay');
  if (menuClose)   menuClose.addEventListener('click', closeMenuModal);
  if (menuOverlay) menuOverlay.addEventListener('click', (e) => { if (e.target === menuOverlay) closeMenuModal(); });
});

// Close notice modal on overlay background click
document.addEventListener('click', (e) => {
  const overlay = document.getElementById('noticesModalOverlay');
  if (overlay && e.target === overlay) {
    closeNoticesModal();
  }
});

// Close modal on Escape
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeNoticesModal();
  }
});


// ─────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────
function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

// Smooth scroll for anchor links
document.querySelectorAll('a[href^="#"]').forEach(a => {
  a.addEventListener('click', function(e) {
    const t = document.querySelector(this.getAttribute('href'));
    if (t) { e.preventDefault(); t.scrollIntoView({ behavior:'smooth', block:'start' }); }
  });
});


// ─────────────────────────────────────────────────────
// INIT
// ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Apply saved theme (cookie persistence — same as admin2)
  const tc = document.cookie.split('; ').find(c => c.startsWith('theme='));
  if (tc && tc.split('=')[1] === 'dark') document.documentElement.classList.add('dark');

  loadHostels();
  loadTicker();
});
