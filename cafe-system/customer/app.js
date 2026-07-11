const API = '';
let lang = 'en';
let tableId = null;
let tableToken = null;
let customerId = null;
let customerName = '';
let customerPhone = '';
let cart = {};
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
    
    // ALWAYS show customer info form first (no localStorage bypass)
    document.getElementById('customer-info-screen').classList.remove('hidden');
    
    // Store table lock status for verification
    window.tableLockedBy = table.locked_by || null;
    window.tableLockedByName = table.locked_by_name || null;
    window.tableLockedByPhone = table.locked_by_phone || null;
  } catch {
    showInvalid();
  }
}

function showInvalid() {
  document.getElementById('invalid-screen').classList.remove('hidden');
}

async function handleCustomerInfo(e) {
  e.preventDefault();
  const btn = document.getElementById('btn-continue');
  const errEl = document.getElementById('customer-info-error');
  const nameInput = document.getElementById('customer-name');
  const phoneInput = document.getElementById('customer-phone');
  
  btn.disabled = true;
  btn.querySelector('span').textContent = lang === 'en' ? 'Verifying...' : 'যাচাই হচ্ছে...';
  errEl.classList.add('hidden');

  const name = nameInput.value.trim();
  const phone = phoneInput.value.trim();

  if (!name || !phone) {
    errEl.textContent = lang === 'en' ? 'Please fill all fields' : 'অনুগ্রহ করে সব ক্ষেত্র পূরণ করুন';
    errEl.classList.remove('hidden');
    btn.disabled = false;
    btn.querySelector('span').textContent = lang === 'en' ? 'Continue to Menu' : 'মেনুতে যান';
    return;
  }

  // Validate Bangladeshi phone number (11 digits starting with 01)
  const phoneRegex = /^01[3-9]\d{8}$/;
  if (!phoneRegex.test(phone)) {
    errEl.textContent = lang === 'en' 
      ? 'Please enter a valid Bangladeshi phone number (11 digits starting with 01, e.g., 01712345678)'
      : 'অনুগ্রহ করে একটি বৈধ বাংলাদেশি ফোন নম্বর দিন (০১ দিয়ে শুরু হওয়া ১১ ডিজিট, যেমন ০১৭১২৩৪৫৬৭৮)';
    errEl.classList.remove('hidden');
    btn.disabled = false;
    btn.querySelector('span').textContent = lang === 'en' ? 'Continue to Menu' : 'মেনুতে যান';
    return;
  }

  try {
    // Don't create customer record yet - just store temp info
    customerId = null;
    customerName = name;
    customerPhone = phone;

    // Check if table is locked by someone else
    if (window.tableLockedBy) {
      const lockedName = window.tableLockedByName || '';
      const lockedPhone = window.tableLockedByPhone || '';
      
      // If the same person is trying to access (matching name AND phone), let them in
      if (name === lockedName && phone === lockedPhone) {
        customerName = name;
        customerPhone = phone;
        document.getElementById('customer-info-screen').classList.add('hidden');
        document.getElementById('app').classList.remove('hidden');
        await loadMenu();
        startStatusPoll();
        showToast(lang === 'en' ? 'Welcome back!' : 'আবার স্বাগতম!');
        return;
      }
      
      // Different person - deny access
      errEl.textContent = lang === 'en'
        ? `This table is currently booked by ${lockedName}. Only ${lockedName} can access this table.`
        : `এই টেবিলটি বর্তমানে ${lockedName} দ্বারা বুক করা আছে। শুধুমাত্র ${lockedName} এই টেবিলটি অ্যাক্সেস করতে পারেন।`;
      errEl.classList.remove('hidden');
      btn.disabled = false;
      btn.querySelector('span').textContent = lang === 'en' ? 'Continue to Menu' : 'মেনুতে যান';
      return;
    }

    // Lock the table
    try {
      const lockRes = await fetch(`${API}/api/tables/${tableId}/lock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          customer_id: 1,
          customer_name: name, 
          customer_phone: phone 
        })
      });
      
      if (!lockRes.ok) {
        const lockData = await lockRes.json();
        throw new Error(lockData.error || 'Failed to lock table');
      }
    } catch (err) {
      console.error('Failed to lock table:', err);
      throw err;
    }

    // Auto-unlock on page close - but only if NO order was placed
    window.__hasOrdered = false;
    window.__unlockOnLeave = function() {
      try {
        if (!window.__hasOrdered) {
          navigator.sendBeacon(
            `${API}/api/tables/${tableId}/unlock`,
            JSON.stringify({ customer_id: null })
          );
        }
      } catch(e) {}
    };
    window.addEventListener('beforeunload', window.__unlockOnLeave);

    // Clear any old localStorage data
    localStorage.removeItem(`cafe_customer_${tableToken}`);

    // Hide customer info screen and show app with animation
    document.getElementById('customer-info-screen').classList.add('hidden');
    document.getElementById('app').classList.remove('hidden');
    
    await loadMenu();
    startStatusPoll();
    
    showToast(lang === 'en' ? 'Welcome! Enjoy your meal.' : 'স্বাগতম! ভালো থাকুন।');
    
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove('hidden');
    btn.disabled = false;
    btn.querySelector('span').textContent = lang === 'en' ? 'Continue to Menu' : 'মেনুতে যান';
  }
}

async function loadMenu() {
  try {
    const res = await fetch(`${API}/api/menu/full`);
    menuData = await res.json();
    renderCategoryTabs();
    renderMenuGrid();
  } catch (e) {
    console.error('Menu load failed', e);
    showToast(lang === 'en' ? 'Failed to load menu' : 'মেনু লোড করতে ব্যর্থ');
  }
}

function renderCategoryTabs() {
  const container = document.getElementById('category-tabs');
  container.innerHTML = '';

  const allBtn = document.createElement('button');
  allBtn.className = 'cat-tab' + (activeCat === null ? ' active' : '');
  allBtn.textContent = t('All', 'সব');
  allBtn.onclick = () => { 
    activeCat = null; 
    renderCategoryTabs(); 
    renderMenuGrid();
    // Smooth scroll to menu
    document.getElementById('menu-grid').scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  container.appendChild(allBtn);

  menuData.forEach(cat => {
    if (!cat.items.length) return;
    const btn = document.createElement('button');
    btn.className = 'cat-tab' + (activeCat === cat.id ? ' active' : '');
    btn.textContent = lang === 'en' ? cat.name_en : cat.name_bn;
    btn.onclick = () => { 
      activeCat = cat.id; 
      renderCategoryTabs(); 
      renderMenuGrid();
      // Smooth scroll to menu
      document.getElementById('menu-grid').scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
    container.appendChild(btn);
  });
}

function renderMenuGrid() {
  const grid = document.getElementById('menu-grid');
  grid.innerHTML = '';

  const filtered = activeCat
    ? menuData.filter(c => c.id === activeCat)
    : menuData;

  if (!filtered.length) {
    grid.innerHTML = `
      <div class="no-orders" style="padding: 40px 20px;">
        <p>${t('No items in this category', 'এই ক্যাটাগরিতে কোনো আইটেম নেই')}</p>
      </div>`;
    return;
  }

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
  card.onclick = () => {
    if (item.is_available) openModal(item);
  };

  const imgWrap = document.createElement('div');
  imgWrap.className = 'item-img-wrap';

  if (item.image_url) {
    const img = document.createElement('img');
    img.src = item.image_url;
    img.alt = item.name_en;
    img.loading = 'lazy';
    img.onerror = () => { 
      imgWrap.innerHTML = '<div class="item-img-placeholder">🍽️</div>'; 
    };
    imgWrap.appendChild(img);
  } else {
    imgWrap.innerHTML = '<div class="item-img-placeholder">🍽️</div>';
  }

  // Add NOT AVAILABLE overlay only for unavailable items
  if (!item.is_available) {
    const notAvailableOverlay = document.createElement('div');
    notAvailableOverlay.className = 'not-available-overlay';
    notAvailableOverlay.textContent = t('NOT AVAILABLE', 'উপলব্ধ নয়');
    imgWrap.appendChild(notAvailableOverlay);
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

  const qty = cartQty(item.id);
  if (qty > 0 && item.is_available) {
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
    // Add bounce animation
    badge.style.animation = 'none';
    badge.offsetHeight; // Trigger reflow
    badge.style.animation = 'bounce 0.3s';
  } else {
    badge.classList.add('hidden');
  }
}

function openModal(item) {
  modalItem = item;
  const name = lang === 'en' ? item.name_en : item.name_bn;
  const desc = lang === 'en' ? item.description_en : item.description_bn;

  document.getElementById('modal-name').textContent = name;
  document.getElementById('modal-desc').textContent = desc || t('No description', 'বর্ণনা নেই');
  document.getElementById('modal-price').textContent = `৳${item.price}`;
  document.getElementById('modal-qty').textContent = cartQty(item.id) || 1;

  const img = document.getElementById('modal-img');
  if (item.image_url) {
    img.src = item.image_url;
    img.style.display = 'block';
  } else {
    img.style.display = 'none';
  }

  document.getElementById('modal-overlay').classList.remove('hidden');
  
  // Prevent body scroll when modal is open
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
  document.body.style.overflow = '';
  modalItem = null;
}

function modalQtyChange(delta) {
  const el = document.getElementById('modal-qty');
  const current = parseInt(el.textContent) || 1;
  const next = Math.max(1, Math.min(99, current + delta));
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
  const totalEl = document.getElementById('cart-total-display');
  const placeBtn = document.getElementById('btn-place-order');
  container.innerHTML = '';

  const entries = Object.values(cart);

  if (!entries.length) {
    container.innerHTML = `
      <div class="empty-cart">
        <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <circle cx="9" cy="21" r="1"/>
          <circle cx="20" cy="21" r="1"/>
          <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
        </svg>
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
    minus.setAttribute('aria-label', 'Decrease quantity');

    const num = document.createElement('span');
    num.className = 'cart-qty-num';
    num.textContent = entry.qty;

    const plus = document.createElement('button');
    plus.textContent = '+';
    plus.onclick = () => changeCartQty(entry.id, 1);
    plus.setAttribute('aria-label', 'Increase quantity');

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
  const note = document.getElementById('order-note').value.trim();

  try {
    const res = await fetch(`${API}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        table_id: tableId, 
        customer_id: customerId, 
        items, 
        note,
        customer_name: customerName,
        customer_phone: customerPhone
      })
    });
    const data = await res.json();

    if (!res.ok) {
      showToast(data.error || t('Order failed', 'অর্ডার ব্যর্থ'));
      btn.disabled = false;
      btn.querySelector('span').textContent = t('Place Order', 'অর্ডার দিন');
      return;
    }

    // Mark that an order was placed - table should stay locked
    window.__hasOrdered = true;
    
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
  pending:   { en: 'Order pending',  bn: 'অর্ডার অপেক্ষাধীন',    cls: 'status-pending' },
  preparing: { en: 'Order received',       bn: 'অর্ডার পেয়েছি',        cls: 'status-preparing' },
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
    setTimeout(() => el.classList.add('hidden'), 300);
  }, 3000);
}

// Close modal on overlay click
document.addEventListener('DOMContentLoaded', () => {
  const modalOverlay = document.getElementById('modal-overlay');
  if (modalOverlay) {
    modalOverlay.addEventListener('click', (e) => {
      if (e.target === modalOverlay) {
        closeModal();
      }
    });
  }
  
  // Add keyboard support for modal
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const modal = document.getElementById('modal-overlay');
      if (!modal.classList.contains('hidden')) {
        closeModal();
      }
    }
  });
});

document.addEventListener('DOMContentLoaded', init);