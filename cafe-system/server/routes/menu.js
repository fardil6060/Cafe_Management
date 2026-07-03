const express = require('express');
const router = express.Router();
const { query, run } = require('../database');

function toInt(value, fallback = 0) {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toPrice(value) {
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : NaN;
}

function boolInt(value, fallback = 0) {
  if (value === undefined || value === null || value === '') return fallback;

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === '0' || normalized === 'false' || normalized === 'no') return 0;
    if (normalized === '1' || normalized === 'true' || normalized === 'yes') return 1;
  }

  return value ? 1 : 0;
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

router.get('/full', (req, res) => {
  const categories = query('SELECT * FROM categories ORDER BY sort_order ASC, id ASC');
  const items = query(
    `SELECT m.*, c.name_en AS category_name, c.name_bn AS category_name_bn
     FROM menu_items m
     LEFT JOIN categories c ON c.id = m.category_id
     WHERE m.is_available = 1
     ORDER BY c.sort_order ASC, m.id ASC`
  );

  const grouped = categories.map(category => ({
    ...category,
    items: items.filter(item => item.category_id === category.id)
  }));

  res.json(grouped);
});

router.get('/categories', (req, res) => {
  res.json(query('SELECT * FROM categories ORDER BY sort_order ASC, id ASC'));
});

router.post('/categories', (req, res) => {
  const nameEn = String(req.body.name_en || '').trim();
  const nameBn = String(req.body.name_bn || '').trim();
  const sortOrder = toInt(req.body.sort_order, 0);

  if (!nameEn || !nameBn) {
    return res.status(400).json({ error: 'Both category names are required' });
  }

  const result = run(
    'INSERT INTO categories (name_en, name_bn, sort_order) VALUES (?, ?, ?)',
    [nameEn, nameBn, sortOrder]
  );
  const category = query('SELECT * FROM categories WHERE id = ?', [result.lastInsertRowid])[0];
  res.status(201).json(category);
});

router.put('/categories/:id', (req, res) => {
  const id = toInt(req.params.id);
  const nameEn = String(req.body.name_en || '').trim();
  const nameBn = String(req.body.name_bn || '').trim();
  const sortOrder = toInt(req.body.sort_order, 0);

  if (!query('SELECT id FROM categories WHERE id = ?', [id]).length) {
    return res.status(404).json({ error: 'Category not found' });
  }

  if (!nameEn || !nameBn) {
    return res.status(400).json({ error: 'Both category names are required' });
  }

  run(
    'UPDATE categories SET name_en = ?, name_bn = ?, sort_order = ? WHERE id = ?',
    [nameEn, nameBn, sortOrder, id]
  );
  res.json(query('SELECT * FROM categories WHERE id = ?', [id])[0]);
});

router.delete('/categories/:id', (req, res) => {
  const id = toInt(req.params.id);

  if (!query('SELECT id FROM categories WHERE id = ?', [id]).length) {
    return res.status(404).json({ error: 'Category not found' });
  }

  run('DELETE FROM menu_items WHERE category_id = ?', [id]);
  run('DELETE FROM categories WHERE id = ?', [id]);
  res.json({ success: true });
});

router.get('/items', (req, res) => {
  res.json(query(
    `SELECT m.*, c.name_en AS category_name, c.name_bn AS category_name_bn
     FROM menu_items m
     LEFT JOIN categories c ON c.id = m.category_id
     ORDER BY c.sort_order ASC, m.id ASC`
  ));
});

router.post('/items', (req, res) => {
  const categoryId = toInt(req.body.category_id);
  const nameEn = String(req.body.name_en || '').trim();
  const nameBn = String(req.body.name_bn || '').trim();
  const descriptionEn = String(req.body.description_en || '').trim();
  const descriptionBn = String(req.body.description_bn || '').trim();
  const price = toPrice(req.body.price);
  const imageUrl = String(req.body.image_url || '').trim();
  const trackStock = boolInt(req.body.track_stock);
  const stockQty = Math.max(0, toInt(req.body.stock_qty, 0));
  const isAvailable = boolInt(req.body.is_available, trackStock && stockQty <= 0 ? 0 : 1);

  if (!categoryId || !query('SELECT id FROM categories WHERE id = ?', [categoryId]).length) {
    return res.status(400).json({ error: 'Valid category is required' });
  }

  if (!nameEn || !nameBn || !Number.isFinite(price) || price < 0) {
    return res.status(400).json({ error: 'Names and a valid price are required' });
  }

  const result = run(
    `INSERT INTO menu_items
       (category_id, name_en, name_bn, description_en, description_bn, price, image_url, is_available, stock_qty, track_stock)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [categoryId, nameEn, nameBn, descriptionEn, descriptionBn, price, imageUrl, isAvailable, stockQty, trackStock]
  );

  res.status(201).json(getItem(result.lastInsertRowid));
});

router.put('/items/:id', (req, res) => {
  const id = toInt(req.params.id);
  const existing = getItem(id);

  if (!existing) {
    return res.status(404).json({ error: 'Item not found' });
  }

  const categoryId = toInt(req.body.category_id, existing.category_id);
  const nameEn = String(req.body.name_en ?? existing.name_en).trim();
  const nameBn = String(req.body.name_bn ?? existing.name_bn).trim();
  const descriptionEn = String(req.body.description_en ?? existing.description_en ?? '').trim();
  const descriptionBn = String(req.body.description_bn ?? existing.description_bn ?? '').trim();
  const price = toPrice(req.body.price ?? existing.price);
  const imageUrl = String(req.body.image_url ?? existing.image_url ?? '').trim();
  const trackStock = boolInt(req.body.track_stock, existing.track_stock);
  const stockQty = Math.max(0, toInt(req.body.stock_qty, existing.stock_qty));
  const isAvailable = boolInt(req.body.is_available, existing.is_available);

  if (!query('SELECT id FROM categories WHERE id = ?', [categoryId]).length) {
    return res.status(400).json({ error: 'Valid category is required' });
  }

  if (!nameEn || !nameBn || !Number.isFinite(price) || price < 0) {
    return res.status(400).json({ error: 'Names and a valid price are required' });
  }

  run(
    `UPDATE menu_items
     SET category_id = ?, name_en = ?, name_bn = ?, description_en = ?, description_bn = ?,
         price = ?, image_url = ?, is_available = ?, stock_qty = ?, track_stock = ?
     WHERE id = ?`,
    [categoryId, nameEn, nameBn, descriptionEn, descriptionBn, price, imageUrl, isAvailable, stockQty, trackStock, id]
  );

  res.json(getItem(id));
});

router.put('/items/:id/availability', (req, res) => {
  const id = toInt(req.params.id);
  const item = getItem(id);

  if (!item) {
    return res.status(404).json({ error: 'Item not found' });
  }

  const isAvailable = boolInt(req.body.is_available, item.is_available);
  run('UPDATE menu_items SET is_available = ? WHERE id = ?', [isAvailable, id]);
  res.json(getItem(id));
});

router.delete('/items/:id', (req, res) => {
  const id = toInt(req.params.id);

  if (!query('SELECT id FROM menu_items WHERE id = ?', [id]).length) {
    return res.status(404).json({ error: 'Item not found' });
  }

  run('DELETE FROM menu_items WHERE id = ?', [id]);
  res.json({ success: true });
});

module.exports = router;
