const express = require('express');
const router = express.Router();
const { query, run } = require('../database');

function toInt(value, fallback = 0) {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getItem(id) {
  return query(
    `SELECT m.*, c.name_en AS category_name, c.name_bn AS category_name_bn
     FROM menu_items m
     LEFT JOIN categories c ON c.id = m.category_id
     WHERE m.id = ?`,
    [id]
  )[0];
}

router.get('/', (req, res) => {
  res.json(query(
    `SELECT m.*, c.name_en AS category_name, c.name_bn AS category_name_bn
     FROM menu_items m
     LEFT JOIN categories c ON c.id = m.category_id
     ORDER BY c.sort_order ASC, m.name_en ASC`
  ));
});

router.get('/low-stock', (req, res) => {
  const threshold = Math.max(0, toInt(req.query.threshold, 10));
  res.json(query(
    `SELECT m.*, c.name_en AS category_name, c.name_bn AS category_name_bn
     FROM menu_items m
     LEFT JOIN categories c ON c.id = m.category_id
     WHERE m.track_stock = 1 AND m.stock_qty <= ?
     ORDER BY m.stock_qty ASC, m.name_en ASC`,
    [threshold]
  ));
});

router.put('/:id/stock', (req, res) => {
  const id = toInt(req.params.id);
  const item = getItem(id);

  if (!item) {
    return res.status(404).json({ error: 'Item not found' });
  }

  const updates = [];
  const params = [];

  if (req.body.stock_qty !== undefined) {
    const stockQty = toInt(req.body.stock_qty, item.stock_qty);
    if (stockQty < 0) return res.status(400).json({ error: 'Stock quantity cannot be negative' });
    updates.push('stock_qty = ?');
    params.push(stockQty);

    if (item.track_stock || req.body.track_stock) {
      updates.push('is_available = ?');
      params.push(stockQty > 0 ? 1 : 0);
    }
  }

  if (req.body.track_stock !== undefined) {
    updates.push('track_stock = ?');
    params.push(req.body.track_stock ? 1 : 0);
  }

  if (!updates.length) {
    return res.status(400).json({ error: 'No stock fields supplied' });
  }

  params.push(id);
  run(`UPDATE menu_items SET ${updates.join(', ')} WHERE id = ?`, params);
  res.json(getItem(id));
});

router.post('/:id/restock', (req, res) => {
  const id = toInt(req.params.id);
  const amount = toInt(req.body.quantity ?? req.body.amount, NaN);
  const item = getItem(id);

  if (!item) return res.status(404).json({ error: 'Item not found' });
  if (!Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ error: 'A positive restock quantity is required' });
  }

  run(
    'UPDATE menu_items SET stock_qty = stock_qty + ?, track_stock = 1, is_available = 1 WHERE id = ?',
    [amount, id]
  );
  res.json(getItem(id));
});

router.put('/:id/availability', (req, res) => {
  const id = toInt(req.params.id);
  const item = getItem(id);

  if (!item) {
    return res.status(404).json({ error: 'Item not found' });
  }

  const isAvailable = req.body.is_available ? 1 : 0;
  run('UPDATE menu_items SET is_available = ? WHERE id = ?', [isAvailable, id]);
  res.json(getItem(id));
});

module.exports = router;
