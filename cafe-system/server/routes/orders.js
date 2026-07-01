const express = require('express');
const router  = express.Router();
const { query, run } = require('../database');

// Lazy-load broadcast to avoid circular deps
function broadcast(event, data) {
  try { require('./events').broadcast(event, data); } catch {}
}

router.get('/', (req, res) => {
  const { status, table_id, date } = req.query;
  let sql = `
    SELECT o.*, t.name as table_name
    FROM orders o
    JOIN tables t ON o.table_id = t.id
  `;
  const params = [];
  const conditions = [];

  if (status) {
    const statuses = String(status).split(',').map(s => s.trim()).filter(Boolean);
    if (statuses.length === 1) {
      conditions.push("o.status = ?");
      params.push(statuses[0]);
    } else if (statuses.length > 1) {
      conditions.push(`o.status IN (${statuses.map(() => '?').join(',')})`);
      params.push(...statuses);
    }
  }
  if (table_id) { conditions.push("o.table_id = ?");     params.push(table_id); }
  if (date)     { conditions.push("date(o.created_at) = date(?)"); params.push(date); }

  if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ');
  sql += ' ORDER BY o.created_at DESC';

  const orders = query(sql, params);

  orders.forEach(order => {
    order.items = query(
      'SELECT * FROM order_items WHERE order_id = ?',
      [order.id]
    );
  });

  res.json(orders);
});

router.get('/:id', (req, res) => {
  const rows = query(
    'SELECT o.*, t.name as table_name FROM orders o JOIN tables t ON o.table_id = t.id WHERE o.id = ?',
    [req.params.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Order not found' });
  const order = rows[0];
  order.items = query('SELECT * FROM order_items WHERE order_id = ?', [order.id]);
  res.json(order);
});

router.post('/', (req, res) => {
  const { table_id, items, note = '' } = req.body;

  if (!table_id || !items || !items.length)
    return res.status(400).json({ error: 'table_id and items are required' });

  const tableRows = query('SELECT * FROM tables WHERE id = ?', [table_id]);
  if (!tableRows.length)
    return res.status(404).json({ error: 'Table not found' });

  const requestedItems = new Map();

  for (const item of items) {
    const itemId = Number(item.item_id);
    const qty = Number(item.quantity);

    if (!Number.isInteger(itemId) || itemId <= 0 || !Number.isInteger(qty) || qty <= 0) {
      return res.status(400).json({ error: 'Each order item needs a valid item_id and positive quantity' });
    }

    requestedItems.set(itemId, (requestedItems.get(itemId) || 0) + qty);
  }

  let total = 0;
  const resolvedItems = [];

  for (const [itemId, qty] of requestedItems.entries()) {
    const menuRows = query('SELECT * FROM menu_items WHERE id = ? AND is_available = 1', [itemId]);
    if (!menuRows.length)
      return res.status(400).json({ error: `Item ${itemId} not available` });

    const menuItem = menuRows[0];

    if (menuItem.track_stock && menuItem.stock_qty < qty)
      return res.status(400).json({ error: `Not enough stock for "${menuItem.name_en}"` });

    total += menuItem.price * qty;
    resolvedItems.push({ menuItem, qty });
  }

  const orderResult = run(
    'INSERT INTO orders (table_id, note, total, status) VALUES (?, ?, ?, ?)',
    [table_id, note, total, 'pending']
  );
  const orderId = orderResult.lastInsertRowid;

  for (const { menuItem, qty } of resolvedItems) {
    run(
      'INSERT INTO order_items (order_id, item_id, item_name, price, quantity) VALUES (?, ?, ?, ?, ?)',
      [orderId, menuItem.id, menuItem.name_en, menuItem.price, qty]
    );

    if (menuItem.track_stock) {
      run(
        'UPDATE menu_items SET stock_qty = stock_qty - ? WHERE id = ?',
        [qty, menuItem.id]
      );
      const updatedItem = query('SELECT stock_qty FROM menu_items WHERE id = ?', [menuItem.id]);
      if (updatedItem[0]?.stock_qty <= 0) {
        run('UPDATE menu_items SET is_available = 0 WHERE id = ?', [menuItem.id]);
      }
    }
  }

  run("UPDATE tables SET status = 'occupied' WHERE id = ?", [table_id]);

  // Broadcast new order to all connected admin SSE clients
  const tableInfo = query('SELECT name FROM tables WHERE id = ?', [table_id]);
  broadcast('new_order', {
    order_id: orderId,
    table_id,
    table_name: tableInfo[0]?.name || 'Table',
    total,
    item_count: resolvedItems.length
  });

  res.json({ success: true, order_id: orderId, total });
});

router.put('/:id/status', (req, res) => {
  const { status } = req.body;
  const validStatuses = ['pending', 'preparing', 'ready', 'served', 'paid', 'cancelled'];
  if (!validStatuses.includes(status))
    return res.status(400).json({ error: 'Invalid status' });

  const existing = query('SELECT * FROM orders WHERE id = ?', [req.params.id]);
  if (!existing.length)
    return res.status(404).json({ error: 'Order not found' });

  if (existing[0].status === 'paid' && status !== 'paid')
    return res.status(400).json({ error: 'Paid orders cannot be changed' });

  if (status === 'cancelled' && existing[0].status !== 'cancelled') {
    const itemsToRestore = query(
      `SELECT oi.item_id, oi.quantity
       FROM order_items oi
       JOIN menu_items m ON m.id = oi.item_id
       WHERE oi.order_id = ? AND m.track_stock = 1`,
      [req.params.id]
    );

    for (const item of itemsToRestore) {
      run(
        'UPDATE menu_items SET stock_qty = stock_qty + ?, is_available = 1 WHERE id = ?',
        [item.quantity, item.item_id]
      );
    }
  }

  run(
    "UPDATE orders SET status = ?, updated_at = datetime('now') WHERE id = ?",
    [status, req.params.id]
  );

  if (status === 'paid' || status === 'cancelled') {
    const orderRows = query('SELECT table_id FROM orders WHERE id = ?', [req.params.id]);
    if (orderRows.length) {
      const activeOrders = query(
        "SELECT id FROM orders WHERE table_id = ? AND status NOT IN ('paid','cancelled')",
        [orderRows[0].table_id]
      );
      if (!activeOrders.length) {
        run("UPDATE tables SET status = 'available' WHERE id = ?", [orderRows[0].table_id]);
      }
    }
  }

  res.json({ success: true });
});

router.delete('/:id', (req, res) => {
  run('DELETE FROM order_items WHERE order_id = ?', [req.params.id]);
  run('DELETE FROM orders WHERE id = ?', [req.params.id]);
  res.json({ success: true });
});

module.exports = router;
