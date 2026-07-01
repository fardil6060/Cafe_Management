const express = require('express');
const router  = express.Router();
const { query } = require('../database');

// Connected SSE clients
const clients = new Set();

// Broadcast an event to all connected admin clients
function broadcast(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  clients.forEach(client => {
    try { client.write(payload); } catch {}
  });
}

// SSE connection endpoint — admin panel connects here
router.get('/stream', (req, res) => {
  res.setHeader('Content-Type',  'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection',    'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  // Send initial ping so client knows it's connected
  res.write(`event: connected\ndata: {"message":"SSE connected"}\n\n`);

  clients.add(res);
  console.log(`[SSE] Client connected. Total: ${clients.size}`);

  // Keep-alive ping every 25 seconds
  const keepAlive = setInterval(() => {
    try { res.write(': ping\n\n'); } catch {}
  }, 25000);

  req.on('close', () => {
    clients.delete(res);
    clearInterval(keepAlive);
    console.log(`[SSE] Client disconnected. Total: ${clients.size}`);
  });
});

// Export broadcast so orders route can call it
module.exports = { router, broadcast };
