/* ─────────────────────────────────────────────
   admin/js/core.js
   Shared utilities for every admin page
───────────────────────────────────────────── */

const API = '';

/* ── Auth guard ── */
function requireAuth() {
  const user = getUser();
  if (!user) {
    window.location.href = '/index.html';
    return null;
  }
  return user;
}

function getUser() {
  try {
    return JSON.parse(localStorage.getItem('cafe_admin_user'));
  } catch {
    return null;
  }
}

function signOut() {
  localStorage.removeItem('cafe_admin_user');
  window.location.href = '/index.html';
}

/* ── Active nav highlight ── */
function setActiveNav() {
  const path = window.location.pathname.split('/').pop();
  document.querySelectorAll('.nav-item[data-page]').forEach(el => {
    el.classList.toggle('active', el.dataset.page === path);
  });
}

/* ── Toast notifications ── */
let _toastTimer = null;
function showToast(msg, type = 'default') {
  let el = document.getElementById('admin-toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'admin-toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.className = 'show' + (type !== 'default' ? ` toast-${type}` : '');
  if (_toastTimer) clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => {
    el.classList.remove('show');
  }, 3000);
}

/* ── API helpers ── */
async function apiFetch(path, opts = {}) {
  const res = await fetch(API + path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

async function apiGet(path) { return apiFetch(path); }

async function apiPost(path, body) {
  return apiFetch(path, { method: 'POST', body: JSON.stringify(body) });
}

async function apiPut(path, body) {
  return apiFetch(path, { method: 'PUT', body: JSON.stringify(body) });
}

async function apiDelete(path) {
  return apiFetch(path, { method: 'DELETE' });
}

/* ── Modal helpers ── */
function openModal(id) {
  document.getElementById(id).classList.remove('hidden');
}

function closeModal(id) {
  document.getElementById(id).classList.add('hidden');
}

function closeModalOnBackdrop(e, id) {
  if (e.target.id === id) closeModal(id);
}

/* ── Date helpers ── */
function formatDate(str) {
  if (!str) return '—';
  return new Date(str).toLocaleDateString('en-BD', {
    day: '2-digit', month: 'short', year: 'numeric'
  });
}

function formatTime(str) {
  if (!str) return '—';
  return new Date(str).toLocaleTimeString('en-BD', {
    hour: '2-digit', minute: '2-digit'
  });
}

function formatDateTime(str) {
  return `${formatDate(str)}, ${formatTime(str)}`;
}

function todayStr() {
  return new Date().toISOString().split('T')[0];
}

/* ── Currency ── */
function taka(amount) {
  return '৳' + parseFloat(amount || 0).toLocaleString('en-BD', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  });
}

/* ── Status badge ── */
function statusBadge(status) {
  const labels = {
    pending:   'Pending',
    preparing: 'Preparing',
    ready:     'Ready',
    served:    'Served',
    paid:      'Paid',
    cancelled: 'Cancelled',
    available: 'Available',
    occupied:  'Occupied',
  };
  return `<span class="badge badge-${status}">${labels[status] || status}</span>`;
}

/* ── Confirm dialog ── */
function confirmAction(msg, callback) {
  if (window.confirm(msg)) callback();
}

/* ── Sidebar user ── */
function renderSidebarUser() {
  const user = getUser();
  if (!user) return;
  const nameEl = document.getElementById('sidebar-username');
  const avatarEl = document.getElementById('sidebar-avatar');
  if (nameEl) nameEl.textContent = user.username;
  if (avatarEl) avatarEl.textContent = user.username[0].toUpperCase();
}

/* ── Topbar date ── */
function renderTopbarDate() {
  const el = document.getElementById('topbar-date');
  if (!el) return;
  el.textContent = new Date().toLocaleDateString('en-BD', {
    weekday: 'short', day: 'numeric', month: 'long', year: 'numeric'
  });
}

/* ── Order badge polling (sidebar) ── */
let _orderPollTimer = null;
async function startOrderBadgePoll() {
  async function refresh() {
    try {
      const orders = await apiGet('/api/orders?status=pending');
      const badge = document.getElementById('pending-orders-badge');
      if (badge) {
        if (orders.length > 0) {
          badge.textContent = orders.length;
          badge.classList.remove('hidden');
        } else {
          badge.classList.add('hidden');
        }
      }
    } catch {}
  }
  await refresh();
  _orderPollTimer = setInterval(refresh, 15000);
}

/* ── Page init ── */
function adminPageInit(title) {
  requireAuth();
  setActiveNav();
  renderSidebarUser();
  renderTopbarDate();
  startOrderBadgePoll();
  injectNotifBell();
  startSSE();

  const titleEl = document.getElementById('page-title');
  if (titleEl && title) titleEl.textContent = title;
}

/* ── SSE Real-time notifications ──────────────────
   Connects to /api/events/stream and fires whenever
   a new order arrives. All admin pages benefit.
─────────────────────────────────────────────────── */

let _sse = null;
let _sseRetryTimer = null;
let _notifQueue = [];
let _notifCount = 0;

function startSSE() {
  if (_sse) return;

  function connect() {
    _sse = new EventSource('/api/events/stream');

    _sse.addEventListener('connected', () => {
      console.log('[SSE] Connected to server');
    });

    _sse.addEventListener('new_order', (e) => {
      const order = JSON.parse(e.data);
      _notifCount++;
      _notifQueue.unshift(order);
      if (_notifQueue.length > 20) _notifQueue.pop();

      updateNotifBell();
      showOrderToast(order);
      playNotifSound();

      // If on orders page, reload the list
      if (window._onNewOrder) window._onNewOrder(order);
    });

    _sse.onerror = () => {
      _sse.close();
      _sse = null;
      // Reconnect after 5 seconds
      _sseRetryTimer = setTimeout(connect, 5000);
    };
  }

  connect();
}

function updateNotifBell() {
  const bell  = document.getElementById('notif-bell');
  const badge = document.getElementById('notif-badge');
  if (!bell) return;
  if (_notifCount > 0) {
    badge.textContent = _notifCount > 9 ? '9+' : _notifCount;
    badge.classList.remove('hidden');
    bell.classList.add('has-notif');
  } else {
    badge.classList.add('hidden');
    bell.classList.remove('has-notif');
  }
}

function clearNotifs() {
  _notifCount = 0;
  updateNotifBell();
  const panel = document.getElementById('notif-panel');
  if (panel) panel.classList.add('hidden');
}

function toggleNotifPanel() {
  const panel = document.getElementById('notif-panel');
  if (!panel) return;
  const isHidden = panel.classList.contains('hidden');
  panel.classList.toggle('hidden');
  if (!isHidden) return;

  // Render notifications
  const list = document.getElementById('notif-list');
  if (!_notifQueue.length) {
    list.innerHTML = `<div style="padding:20px;text-align:center;color:var(--text-3);font-size:13px">No new orders yet</div>`;
  } else {
    list.innerHTML = _notifQueue.map(o => `
      <div style="padding:12px 16px;border-bottom:1px solid var(--border);display:flex;gap:10px;align-items:flex-start">
        <div style="width:8px;height:8px;border-radius:50%;background:var(--brand);margin-top:5px;flex-shrink:0"></div>
        <div>
          <div style="font-size:13px;font-weight:600">New order #${o.order_id} — ${o.table_name}</div>
          <div style="font-size:11px;color:var(--text-3);margin-top:2px">${o.item_count} item(s) · ${taka(o.total)}</div>
        </div>
        <a href="/orders.html" style="margin-left:auto;font-size:12px;color:var(--brand);text-decoration:none;white-space:nowrap">View →</a>
      </div>`).join('');
  }
  _notifCount = 0;
  updateNotifBell();
}

function showOrderToast(order) {
  showToast(`🛎 New order from ${order.table_name} — ${taka(order.total)}`);
}

function playNotifSound() {
  try {
    const ctx  = new (window.AudioContext || window.webkitAudioContext)();
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 660;
    osc.type = 'sine';
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.25, ctx.currentTime + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.5);
  } catch {}
}

/* Inject notification bell into topbar right */
function injectNotifBell() {
  const right = document.querySelector('.topbar-right');
  if (!right || document.getElementById('notif-bell')) return;

  const bellHTML = `
    <div style="position:relative;display:inline-flex">
      <button id="notif-bell" class="btn-icon" onclick="toggleNotifPanel()" title="Notifications"
        style="position:relative">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
          stroke-linecap="round" stroke-linejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
          <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
        </svg>
        <span id="notif-badge" class="hidden"
          style="position:absolute;top:-5px;right:-5px;background:var(--brand);color:#fff;
                 border-radius:50%;width:17px;height:17px;font-size:10px;font-weight:700;
                 display:flex;align-items:center;justify-content:center;line-height:1">0</span>
      </button>
      <div id="notif-panel" class="hidden"
        style="position:absolute;top:calc(100% + 8px);right:0;width:320px;
               background:var(--surface);border:1.5px solid var(--border);
               border-radius:var(--radius-md);box-shadow:var(--shadow-md);z-index:200;overflow:hidden">
        <div style="display:flex;justify-content:space-between;align-items:center;
                    padding:12px 16px;border-bottom:1px solid var(--border)">
          <span style="font-size:13px;font-weight:700">Order Notifications</span>
          <button onclick="clearNotifs()" style="font-size:11px;color:var(--brand);
                  background:none;border:none;cursor:pointer;font-family:var(--font)">Clear all</button>
        </div>
        <div id="notif-list" style="max-height:320px;overflow-y:auto"></div>
        <div style="padding:10px 16px;border-top:1px solid var(--border);text-align:center">
          <a href="/orders.html" style="font-size:12px;color:var(--brand);text-decoration:none;font-weight:600">
            View all orders →
          </a>
        </div>
      </div>
    </div>`;

  right.insertAdjacentHTML('afterbegin', bellHTML);

  // Close panel when clicking outside
  document.addEventListener('click', (e) => {
    const bell  = document.getElementById('notif-bell');
    const panel = document.getElementById('notif-panel');
    if (panel && !panel.classList.contains('hidden') &&
        !panel.contains(e.target) && !bell.contains(e.target)) {
      panel.classList.add('hidden');
    }
  });
}
