const express = require('express');
const router = express.Router();
const { query, run } = require('../database');

router.post('/login', (req, res) => {
  const username = String(req.body.username || '').trim();
  const password = String(req.body.password || '');

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  const users = query(
    'SELECT id, username FROM admin_users WHERE username = ? AND password = ?',
    [username, password]
  );

  if (!users.length) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }

  res.json({ success: true, user: users[0] });
});

router.post('/change-password', (req, res) => {
  const username = String(req.body.username || '').trim();
  const currentPassword = String(req.body.current_password || req.body.currentPassword || '');
  const newPassword = String(req.body.new_password || req.body.newPassword || '');

  if (!username || !currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Username, current password, and new password are required' });
  }

  const users = query(
    'SELECT id FROM admin_users WHERE username = ? AND password = ?',
    [username, currentPassword]
  );

  if (!users.length) {
    return res.status(401).json({ error: 'Current password is incorrect' });
  }

  run('UPDATE admin_users SET password = ? WHERE id = ?', [newPassword, users[0].id]);
  res.json({ success: true });
});

module.exports = router;
