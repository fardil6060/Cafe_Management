const express = require('express');
const router = express.Router();
const { query, run } = require('../database');

function toInt(value, fallback = 0) {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function dateFilters(req) {
  const conditions = [];
  const params = [];

  if (req.query.from) {
    conditions.push('date(s.paid_at) >= date(?)');
    params.push(req.query.from);
  }

  if (req.query.to) {
    conditions.push('date(s.paid_at) <= date(?)');
    params.push(req.query.to);
  }

  return { conditions, params };
}

function saleByOrder(orderId) {
  return query(
    `SELECT s.*, COALESCE(t.name, 'Deleted table') AS table_name, o.customer_name
     FROM sales s
     LEFT JOIN orders o ON o.id = s.order_id
     LEFT JOIN tables t ON t.id = o.table_id
     WHERE s.order_id = ?`,
    [orderId]
  )[0];
}

function refreshTableStatus(tableId) {
  const activeOrders = query(
    "SELECT id FROM orders WHERE table_id = ? AND status NOT IN ('paid', 'cancelled')",
    [tableId]
  );

  if (!activeOrders.length) {
    run("UPDATE tables SET status = 'available' WHERE id = ?", [tableId]);
  }
}

router.post('/confirm', (req, res) => {
  const orderId = toInt(req.body.order_id);
  const customerId = req.body.customer_id ? toInt(req.body.customer_id) : null;

  if (!orderId) {
    return res.status(400).json({ error: 'order_id is required' });
  }

  const order = query('SELECT * FROM orders WHERE id = ?', [orderId])[0];
  if (!order) {
    return res.status(404).json({ error: 'Order not found' });
  }

  const existingSale = saleByOrder(orderId);
  if (existingSale) {
    return res.json({ success: true, sale: existingSale });
  }

  if (order.status === 'cancelled') {
    return res.status(400).json({ error: 'Cancelled orders cannot be paid' });
  }

  // If no customer_id provided, create one from order's customer info
  let finalCustomerId = customerId;
  if (!finalCustomerId && order.customer_id) {
    finalCustomerId = order.customer_id;
  }

  // Create/update customer record with name and phone from order
  if (finalCustomerId && (order.customer_name || order.customer_phone)) {
    const existingCustomer = query('SELECT * FROM customers WHERE id = ?', [finalCustomerId])[0];
    if (existingCustomer) {
      // Update existing customer
      run(
        `UPDATE customers 
         SET name = COALESCE(?, name),
             phone = COALESCE(?, phone),
             visit_count = visit_count + 1,
             total_spent = total_spent + ?,
             last_visit = datetime('now')
         WHERE id = ?`,
        [order.customer_name, order.customer_phone, order.total, finalCustomerId]
      );
    } else {
      // Create new customer
      run(
        `INSERT INTO customers (name, phone, visit_count, total_spent, last_visit)
         VALUES (?, ?, 1, ?, datetime('now'))`,
        [order.customer_name, order.customer_phone, order.total]
      );
    }
  }

  const result = run(
    'INSERT INTO sales (order_id, customer_id, total) VALUES (?, ?, ?)',
    [orderId, finalCustomerId, order.total]
  );

  run(
    "UPDATE orders SET status = 'paid', updated_at = datetime('now') WHERE id = ?",
    [orderId]
  );

  // Unlock the table when payment is confirmed and clear customer info
  run("UPDATE tables SET locked_by = NULL, locked_by_name = '', locked_by_phone = '', status = 'available' WHERE id = ?", [order.table_id]);
  
  res.status(201).json({ success: true, sale: saleByOrder(orderId), sale_id: result.lastInsertRowid });
});

router.get('/summary', (req, res) => {
  const summary = query(
    `SELECT COALESCE(SUM(total), 0) AS total, COUNT(*) AS count
     FROM sales
     WHERE date(paid_at) = date('now')`
  )[0] || { total: 0, count: 0 };

  const bestSellers = query(
    `SELECT oi.item_name,
            SUM(oi.quantity) AS total_qty,
            SUM(oi.quantity * oi.price) AS revenue
     FROM sales s
     JOIN order_items oi ON oi.order_id = s.order_id
     WHERE date(s.paid_at) = date('now')
     GROUP BY oi.item_name
     ORDER BY total_qty DESC, revenue DESC
     LIMIT 5`
  );

  res.json({
    total: summary.total || 0,
    count: summary.count || 0,
    best_sellers: bestSellers
  });
});

router.get('/history', (req, res) => {
  const limit = Math.min(1000, Math.max(1, toInt(req.query.limit, 50)));
  const offset = Math.max(0, toInt(req.query.offset, 0));
  const { conditions, params } = dateFilters(req);

  let sql = `
    SELECT s.*, COALESCE(t.name, 'Deleted table') AS table_name, c.name AS customer_name
    FROM sales s
    LEFT JOIN orders o ON o.id = s.order_id
    LEFT JOIN tables t ON t.id = o.table_id
    LEFT JOIN customers c ON c.id = s.customer_id
  `;

  if (conditions.length) sql += ` WHERE ${conditions.join(' AND ')}`;
  sql += ' ORDER BY datetime(s.paid_at) DESC, s.id DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  res.json(query(sql, params));
});

router.get('/revenue', (req, res) => {
  const period = req.query.period === 'monthly' ? 'monthly' : 'weekly';

  if (period === 'monthly') {
    return res.json(query(
      `SELECT strftime('%Y-%m', paid_at) AS period,
              COALESCE(SUM(total), 0) AS revenue,
              COUNT(*) AS orders
       FROM sales
       WHERE date(paid_at) >= date('now', '-11 months')
       GROUP BY strftime('%Y-%m', paid_at)
       ORDER BY period DESC
       LIMIT 12`
    ));
  }

  res.json(query(
    `SELECT date(paid_at) AS period,
            COALESCE(SUM(total), 0) AS revenue,
            COUNT(*) AS orders
     FROM sales
     WHERE date(paid_at) >= date('now', '-6 days')
     GROUP BY date(paid_at)
     ORDER BY period DESC
     LIMIT 7`
  ));
});

router.get('/by-table', (req, res) => {
  const { conditions, params } = dateFilters(req);

  let sql = `
    SELECT COALESCE(t.name, 'Deleted table') AS table_name,
           COUNT(*) AS total_orders,
           COALESCE(SUM(s.total), 0) AS revenue
    FROM sales s
    LEFT JOIN orders o ON o.id = s.order_id
    LEFT JOIN tables t ON t.id = o.table_id
  `;

  if (conditions.length) sql += ` WHERE ${conditions.join(' AND ')}`;
  sql += ' GROUP BY COALESCE(t.name, \'Deleted table\') ORDER BY revenue DESC';

  res.json(query(sql, params));
});

module.exports = router;
