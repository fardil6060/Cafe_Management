const express = require('express');
const router = express.Router();
const { query, run } = require('../database');

function toInt(value, fallback = 0) {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getCustomer(id) {
  return query('SELECT * FROM customers WHERE id = ?', [id])[0];
}

router.get('/', (req, res) => {
  const search = String(req.query.search || '').trim();

  if (search) {
    const term = `%${search}%`;
    return res.json(query(
      `SELECT * FROM customers
       WHERE name LIKE ? OR phone LIKE ?
       ORDER BY datetime(last_visit) DESC, id DESC`,
      [term, term]
    ));
  }

  res.json(query('SELECT * FROM customers ORDER BY datetime(last_visit) DESC, id DESC'));
});

router.post('/', (req, res) => {
  const name = String(req.body.name || '').trim();
  const phone = String(req.body.phone || '').trim();

  if (!name && !phone) {
    return res.status(400).json({ error: 'Customer name or phone is required' });
  }

  if (phone) {
    const existing = query('SELECT * FROM customers WHERE phone = ?', [phone])[0];
    if (existing) {
      if (name && !existing.name) {
        run('UPDATE customers SET name = ? WHERE id = ?', [name, existing.id]);
      }
      return res.json(query('SELECT * FROM customers WHERE id = ?', [existing.id])[0]);
    }
  }

  const result = run(
    `INSERT INTO customers (name, phone, visit_count, total_spent, last_visit)
     VALUES (?, ?, 0, 0, datetime('now'))`,
    [name, phone]
  );

  res.status(201).json(getCustomer(result.lastInsertRowid));
});

router.get('/:id', (req, res) => {
  const id = toInt(req.params.id);
  const customer = getCustomer(id);

  if (!customer) {
    return res.status(404).json({ error: 'Customer not found' });
  }

  customer.sales = query(
    `SELECT s.*, o.table_id, COALESCE(t.name, 'Deleted table') AS table_name
     FROM sales s
     LEFT JOIN orders o ON o.id = s.order_id
     LEFT JOIN tables t ON t.id = o.table_id
     WHERE s.customer_id = ?
     ORDER BY datetime(s.paid_at) DESC, s.id DESC`,
    [id]
  );

  res.json(customer);
});

router.delete('/:id', (req, res) => {
  const id = toInt(req.params.id);

  if (!getCustomer(id)) {
    return res.status(404).json({ error: 'Customer not found' });
  }

  run('UPDATE sales SET customer_id = NULL WHERE customer_id = ?', [id]);
  run('DELETE FROM customers WHERE id = ?', [id]);
  res.json({ success: true });
});

module.exports = router;
