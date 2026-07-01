const express = require('express');
const QRCode = require('qrcode');
const router = express.Router();
const { query } = require('../database');

function cleanHost(value, req) {
  const raw = String(value || `${req.protocol}://${req.get('host') || 'localhost:3000'}`).trim();
  return raw.replace(/\/+$/, '');
}

async function buildQR(table, host) {
  const menuUrl = `${host}/menu?t=${encodeURIComponent(table.qr_token)}`;
  const qrImage = await QRCode.toDataURL(menuUrl, {
    errorCorrectionLevel: 'M',
    margin: 2,
    width: 320
  });

  return {
    table_id: table.id,
    table_name: table.name,
    qr_token: table.qr_token,
    menu_url: menuUrl,
    qr_image: qrImage
  };
}

router.get('/table/:id', async (req, res, next) => {
  try {
    const table = query('SELECT * FROM tables WHERE id = ?', [req.params.id])[0];
    if (!table) return res.status(404).json({ error: 'Table not found' });
    res.json(await buildQR(table, cleanHost(req.query.host, req)));
  } catch (err) {
    next(err);
  }
});

router.get('/all', async (req, res, next) => {
  try {
    const host = cleanHost(req.query.host, req);
    const tables = query('SELECT * FROM tables ORDER BY id ASC');
    const codes = await Promise.all(tables.map(table => buildQR(table, host)));
    res.json(codes);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
