const express = require('express');
const { v4: uuidv4 } = require('uuid');
const router = express.Router();
const { query, run } = require('../database');

function toInt(value, fallback = 0) {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function makeToken() {
  return uuidv4().replace(/-/g, '').substring(0, 12);
}

function makeUniqueToken() {
  let token = makeToken();
  while (query('SELECT id FROM tables WHERE qr_token = ?', [token]).length) {
    token = makeToken();
  }
  return token;
}

router.get('/', (req, res) => {
  res.json(query(
    `SELECT t.*,
            COUNT(CASE WHEN o.status NOT IN ('paid', 'cancelled') THEN 1 END) AS active_orders
     FROM tables t
     LEFT JOIN orders o ON o.table_id = t.id
     GROUP BY t.id
     ORDER BY t.id ASC`
  ));
});

router.get('/by-token/:token', (req, res) => {
  const token = String(req.params.token || '').trim();
  const table = query('SELECT * FROM tables WHERE qr_token = ?', [token])[0];

  if (!table) {
    return res.status(404).json({ error: 'Table not found' });
  }

  res.json(table);
});

router.post('/', (req, res) => {
  const name = String(req.body.name || '').trim();
  const seatCount = Math.max(1, toInt(req.body.seat_count, 4));

  if (!name) {
    return res.status(400).json({ error: 'Table name is required' });
  }

  const token = makeUniqueToken();
  const result = run(
    'INSERT INTO tables (name, qr_token, seat_count, status) VALUES (?, ?, ?, ?)',
    [name, token, seatCount, 'available']
  );
  const table = query('SELECT * FROM tables WHERE id = ?', [result.lastInsertRowid])[0];
  res.status(201).json(table);
});

router.put('/:id', (req, res) => {
  const id = toInt(req.params.id);
  const existing = query('SELECT * FROM tables WHERE id = ?', [id])[0];

  if (!existing) {
    return res.status(404).json({ error: 'Table not found' });
  }

  const name = String(req.body.name ?? existing.name).trim();
  const seatCount = Math.max(1, toInt(req.body.seat_count, existing.seat_count));
  const status = String(req.body.status ?? existing.status);
  const validStatuses = ['available', 'occupied'];

  if (!name) return res.status(400).json({ error: 'Table name is required' });
  if (!validStatuses.includes(status)) return res.status(400).json({ error: 'Invalid table status' });

  run('UPDATE tables SET name = ?, seat_count = ?, status = ? WHERE id = ?', [name, seatCount, status, id]);
  res.json(query('SELECT * FROM tables WHERE id = ?', [id])[0]);
});

router.delete('/:id', (req, res) => {
  const id = toInt(req.params.id);
  const table = query('SELECT * FROM tables WHERE id = ?', [id])[0];

  if (!table) {
    return res.status(404).json({ error: 'Table not found' });
  }

  const activeOrders = query(
    "SELECT id FROM orders WHERE table_id = ? AND status NOT IN ('paid', 'cancelled')",
    [id]
  );

  if (activeOrders.length) {
    return res.status(400).json({ error: 'Cannot delete a table with active orders' });
  }

  run('DELETE FROM tables WHERE id = ?', [id]);
  res.json({ success: true });
});

router.post('/:id/regenerate-qr', (req, res) => {
  const id = toInt(req.params.id);
  const table = query('SELECT * FROM tables WHERE id = ?', [id])[0];

  if (!table) {
    return res.status(404).json({ error: 'Table not found' });
  }

  const token = makeUniqueToken();
  run('UPDATE tables SET qr_token = ? WHERE id = ?', [token, id]);
  res.json(query('SELECT * FROM tables WHERE id = ?', [id])[0]);
});

module.exports = router;
