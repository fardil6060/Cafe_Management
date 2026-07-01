
const API   = '';
let lang    = 'en';
let tableId = null;
let tableToken = null;
let cart    = {};
let menuData = [];
let activeCat = null;
let modalItem = null;
let statusPollTimer = null;

const t = (en, bn) => lang === 'en' ? en : bn;

async function init() {
  const params = new URLSearchParams(location.search);
  tableToken = params.get('t');

  if (!tableToken) {
    showInvalid();
    return;
  }

  try {
    const res = await fetch(`${API}/api/tables/by-token/${tableToken}`);
    if (!res.ok) throw new Error('Invalid token');
    const table = await res.json();
    tableId = table.id;
    document.getElementById('table-name-display').textContent = table.name;
    document.getElementById('app').classList.remove('hidden');
    await loadMenu();
    startStatusPoll();
  } catch {
    showInvalid();
  }
}

function showInvalid() {
  document.getElementById('invalid-screen').classList.remove('hidden');
}

async function loadMenu() {
  try {
    const res = await fetch(`${API}/api/menu/full`);
    menuData = await res.json();
    renderCategoryTabs();
    renderMenuGrid();
  } catch (e) {
    console.error('Menu load failed', e);
  }
}

function renderCategoryTabs() {
  const container = document.getElementById('category-tabs');
  container.innerHTML = '';

  const allBtn = document.createElement('button');
  allBtn.className = 'cat-tab' + (activeCat === null ? ' active' : '');
  allBtn.textContent = t('All', 'সব');
  allBtn.onclick = () => { activeCat = null; renderCategoryTabs(); renderMenuGrid(); };
  container.appendChild(allBtn);

  menuData.forEach(cat => {
    if (!cat.items.length) return;
    const btn = document.createElement('button');
    btn.className = 'cat-tab' + (activeCat === cat.id ? ' active' : '');
    btn.textContent = lang === 'en' ? cat.name_en : cat.name_bn;
    btn.onclick = () => { activeCat = cat.id; renderCategoryTabs(); renderMenuGrid(); };
    container.appendChild(btn);
  });
}

function renderMenuGrid() {
  const grid = document.getElementById('menu-grid');
  grid.innerHTML = '';

  const filtered = activeCat
    ? menuData.filter(c => c.id === activeCat)
    : menuData;

  filtered.forEach(cat => {
    if (!cat.items.length) return;

    const block = document.createElement('div');
    block.className = 'category-block';

    const title = document.createElement('div');
    title.className = 'category-title';
    title.textContent = lang === 'en' ? cat.name_en : cat.name_bn;
    block.appendChild(title);

    const row = document.createElement('div');
    row.className = 'items-row';

    cat.items.forEach(item => {
      row.appendChild(buildItemCard(item));
    });

    block.appendChild(row);
    grid.appendChild(block);
  });
}

function buildItemCard(item) {
  const card = document.createElement('div');
  card.className = 'item-card' + (!item.is_available ? ' unavailable' : '');
  card.onclick = () => openModal(item);

  const imgWrap = document.createElement('div');
  imgWrap.className = 'item-img-wrap';

  if (item.image_url) {
    const img = document.createElement('img');
    img.src = item.image_url;
    img.alt = item.name_en;
    img.onerror = () => { imgWrap.innerHTML = '<div class="item-img-placeholder">☕</div>'; };
    imgWrap.appendChild(img);
  } else {
    imgWrap.innerHTML = '<div class="item-img-placeholder">☕</div>';
  }

  const body = document.createElement('div');
  body.className = 'item-body';

  const name = document.createElement('div');
  name.className = 'item-name';
  name.textContent = lang === 'en' ? item.name_en : item.name_bn;

  const price = document.createElement('div');
  price.className = 'item-price';
  price.textContent = `৳${item.price}`;

  body.appendChild(name);
  body.appendChild(price);
  card.appendChild(imgWrap);
  card.appendChild(body);

  if (!item.is_available) {
    const badge = document.createElement('div');
    badge.className = 'item-out-badge';
    badge.textContent = t('Out of stock', 'স্টক শেষ');
    card.appendChild(badge);
  }

  const qty = cartQty(item.id);
  if (qty > 0) {
    const dot = document.createElement('div');
    dot.className = 'item-in-cart-dot';
    dot.textContent = qty;
    card.appendChild(dot);
  }

  return card;
}

function cartQty(itemId) {
  return cart[itemId]?.qty || 0;
}

function cartTotal() {
  return Object.values(cart).reduce((sum, e) => sum + e.price * e.qty, 0);
}

function cartCount() {
  return Object.values(cart).reduce((sum, e) => sum + e.qty, 0);
}

function updateCartBadge() {
  const badge = document.getElementById('cart-badge');
  const count = cartCount();
  if (count > 0) {
    badge.textContent = count;
    badge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
  }
}

function openModal(item) {
  modalItem = item;
  const name = lang === 'en' ? item.name_en : item.name_bn;
  const desc = lang === 'en' ? item.description_en : item.description_bn;

  document.getElementById('modal-name').textContent = name;
  document.getElementById('modal-desc').textContent = desc || '';
  document.getElementById('modal-price').textContent = `৳${item.price}`;
  document.getElementById('modal-qty').textContent = cartQty(item.id) || 1;

  const img = document.getElementById('modal-img');
  img.src = item.image_url || '';
  img.style.display = item.image_url ? 'block' : 'none';

  document.getElementById('modal-overlay').classList.remove('hidden');
}

function closeModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
  modalItem = null;
}

function modalQtyChange(delta) {
  const el = document.getElementById('modal-qty');
  const current = parseInt(el.textContent) || 1;
  const next = Math.max(1, current + delta);
  el.textContent = next;
}

function addFromModal() {
  if (!modalItem) return;
  const qty = parseInt(document.getElementById('modal-qty').textContent) || 1;
  addToCart(modalItem, qty);
  closeModal();
  showToast(t('Added to order', 'অর্ডারে যোগ হয়েছে'));
  renderMenuGrid();
  updateCartBadge();
}

function addToCart(item, qty = 1) {
  if (cart[item.id]) {
    cart[item.id].qty += qty;
  } else {
    cart[item.id] = {
      id: item.id,
      name_en: item.name_en,
      name_bn: item.name_bn,
      price: item.price,
      qty
    };
  }
  updateCartBadge();
}

function changeCartQty(itemId, delta) {
  if (!cart[itemId]) return;
  cart[itemId].qty = Math.max(0, cart[itemId].qty + delta);
  if (cart[itemId].qty === 0) delete cart[itemId];
  renderCart();
  renderMenuGrid();
  updateCartBadge();
}

function renderCart() {
  const container = document.getElementById('cart-items');
  const totalEl   = document.getElementById('cart-total-display');
  const placeBtn  = document.getElementById('btn-place-order');
  container.innerHTML = '';

  const entries = Object.values(cart);

  if (!entries.length) {
    container.innerHTML = `
      <div class="empty-cart">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
        <p>${t('No items yet. Browse the menu to add items.', 'এখনো কিছু যোগ হয়নি। মেনু থেকে আইটেম বেছে নিন।')}</p>
      </div>`;
    totalEl.textContent = '৳0';
    placeBtn.querySelector('span').textContent = t('Place Order', 'অর্ডার দিন');
    placeBtn.disabled = true;
    return;
  }

  placeBtn.disabled = false;
  placeBtn.querySelector('span').textContent = t('Place Order', 'অর্ডার দিন');

  entries.forEach(entry => {
    const row = document.createElement('div');
    row.className = 'cart-item-row';

    const name = document.createElement('div');
    name.className = 'cart-item-name';
    name.textContent = lang === 'en' ? entry.name_en : entry.name_bn;

    const ctrl = document.createElement('div');
    ctrl.className = 'cart-qty-ctrl';

    const minus = document.createElement('button');
    minus.textContent = '−';
    minus.onclick = () => changeCartQty(entry.id, -1);

    const num = document.createElement('span');
    num.className = 'cart-qty-num';
    num.textContent = entry.qty;

    const plus = document.createElement('button');
    plus.textContent = '+';
    plus.onclick = () => changeCartQty(entry.id, 1);

    ctrl.appendChild(minus);
    ctrl.appendChild(num);
    ctrl.appendChild(plus);

    const price = document.createElement('div');
    price.className = 'cart-item-price';
    price.textContent = `৳${(entry.price * entry.qty).toFixed(0)}`;

    row.appendChild(name);
    row.appendChild(ctrl);
    row.appendChild(price);
    container.appendChild(row);
  });

  totalEl.textContent = `৳${cartTotal().toFixed(0)}`;
}

async function placeOrder() {
  const entries = Object.values(cart);
  if (!entries.length) return;

  const btn = document.getElementById('btn-place-order');
  btn.disabled = true;
  btn.querySelector('span').textContent = t('Placing order...', 'অর্ডার দেওয়া হচ্ছে...');

  const items = entries.map(e => ({ item_id: e.id, quantity: e.qty }));
  const note  = document.getElementById('order-note').value.trim();

  try {
    const res = await fetch(`${API}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ table_id: tableId, items, note })
    });
    const data = await res.json();

    if (!res.ok) {
      showToast(data.error || t('Order failed', 'অর্ডার ব্যর্থ'));
      btn.disabled = false;
      btn.querySelector('span').textContent = t('Place Order', 'অর্ডার দিন');
      return;
    }

    cart = {};
    document.getElementById('order-note').value = '';
    btn.querySelector('span').textContent = t('Place Order', 'অর্ডার দিন');
    updateCartBadge();
    showToast(t('Order placed! We\'re on it.', 'অর্ডার হয়েছে! আমরা তৈরি করছি।'));
    switchTab('status');
    await loadActiveOrders();

  } catch {
    showToast(t('Network error. Try again.', 'নেটওয়ার্ক সমস্যা। আবার চেষ্টা করুন।'));
    btn.disabled = false;
    btn.querySelector('span').textContent = t('Place Order', 'অর্ডার দিন');
  }
}

const STATUS_LABELS = {
  pending:   { en: 'Order received',  bn: 'অর্ডার পেয়েছি',    cls: 'status-pending' },
  preparing: { en: 'Preparing',       bn: 'তৈরি হচ্ছে',        cls: 'status-preparing' },
  ready:     { en: 'Ready to serve',  bn: 'পরিবেশনের জন্য প্রস্তুত', cls: 'status-ready' },
  served:    { en: 'Served',          bn: 'পরিবেশিত',          cls: 'status-served' },
};

async function loadActiveOrders() {
  try {
    const res = await fetch(
      `${API}/api/orders?table_id=${tableId}&status=pending,preparing,ready,served`
    );
    let orders = await res.json();
    orders = orders.filter(o => ['pending','preparing','ready','served'].includes(o.status));
    renderOrderStatus(orders);
  } catch (e) {
    console.error('Status load failed', e);
  }
}

function renderOrderStatus(orders) {
  const list = document.getElementById('active-orders-list');
  list.innerHTML = '';

  if (!orders.length) {
    list.innerHTML = `<div class="no-orders">${t('No active orders for this table.', 'এই টেবিলে এখন কোনো সক্রিয় অর্ডার নেই।')}</div>`;
    return;
  }

  orders.forEach(order => {
    const card = document.createElement('div');
    card.className = 'order-card';

    const statusInfo = STATUS_LABELS[order.status] || STATUS_LABELS.pending;
    const time = new Date(order.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    card.innerHTML = `
      <div class="order-card-header">
        <div>
          <div class="order-id">${t('Order', 'অর্ডার')} #${order.id}</div>
          <div class="order-time">${time}</div>
        </div>
        <span class="order-status-badge ${statusInfo.cls}">${lang === 'en' ? statusInfo.en : statusInfo.bn}</span>
      </div>
      <div class="order-items-list">
        ${(order.items || []).map(i => `
          <div class="order-line">
            <span>${i.item_name} × ${i.quantity}</span>
            <span class="order-line-right">৳${(i.price * i.quantity).toFixed(0)}</span>
          </div>`).join('')}
      </div>
      <div class="order-card-footer">
        <span>${t('Total', 'মোট')}</span>
        <span>৳${parseFloat(order.total).toFixed(0)}</span>
      </div>`;

    list.appendChild(card);
  });
}

function startStatusPoll() {
  if (statusPollTimer) clearInterval(statusPollTimer);
  statusPollTimer = setInterval(async () => {
    if (document.visibilityState === 'visible') {
      await loadActiveOrders();
    }
  }, 10000);
}

function switchTab(tab) {
  document.querySelectorAll('.nav-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.tab === tab);
  });

  document.getElementById('menu-section').classList.toggle('hidden', tab !== 'menu');
  document.getElementById('cart-section').classList.toggle('hidden', tab !== 'cart');
  document.getElementById('status-section').classList.toggle('hidden', tab !== 'status');

  if (tab === 'cart')   renderCart();
  if (tab === 'status') loadActiveOrders();
}

function toggleLang() {
  lang = lang === 'en' ? 'bn' : 'en';
  document.body.classList.toggle('bn', lang === 'bn');
  document.getElementById('lang-toggle').textContent = lang === 'en' ? 'বাংলা' : 'English';

  document.querySelectorAll('[data-en]').forEach(el => {
    el.textContent = lang === 'en' ? el.dataset.en : el.dataset.bn;
  });

  renderCategoryTabs();
  renderMenuGrid();

  const activeTab = document.querySelector('.nav-btn.active')?.dataset.tab;
  if (activeTab === 'cart')   renderCart();
  if (activeTab === 'status') loadActiveOrders();
}

let toastTimer = null;
function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  el.classList.add('show');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.classList.add('hidden'), 200);
  }, 2800);
}

document.addEventListener('DOMContentLoaded', init);
