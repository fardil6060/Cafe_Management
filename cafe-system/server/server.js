const express = require('express');
const cors    = require('cors');
const path    = require('path');
const { initDB } = require('./database');

const app  = express();
const PORT = Number(process.env.PORT || 3000);

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use(express.static(path.join(__dirname, '..', 'admin')));
app.use('/customer', express.static(path.join(__dirname, '..', 'customer')));

const menuRoute      = require('./routes/menu');
const ordersRoute    = require('./routes/orders');
const tablesRoute    = require('./routes/tables');
const inventoryRoute = require('./routes/inventory');
const customersRoute = require('./routes/customers');
const salesRoute     = require('./routes/sales');
const authRoute      = require('./routes/auth');
const qrRoute        = require('./routes/qr');
const { router: eventsRoute } = require('./routes/events');

app.use('/api/menu',      menuRoute);
app.use('/api/orders',    ordersRoute);
app.use('/api/tables',    tablesRoute);
app.use('/api/inventory', inventoryRoute);
app.use('/api/customers', customersRoute);
app.use('/api/sales',     salesRoute);
app.use('/api/auth',      authRoute);
app.use('/api/qr',        qrRoute);
app.use('/api/events',    eventsRoute);

app.get('/menu', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'customer', 'index.html'));
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

app.use((err, req, res, next) => {
  console.error('[Server Error]', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

function startServer(port) {
  const server = app.listen(port, () => {
    console.log(`\n✅ Cafe system running at http://localhost:${port}`);
    console.log(`   Admin panel : http://localhost:${port}/index.html`);
    console.log(`   Customer menu: http://localhost:${port}/menu?t=<token>`);
    console.log(`   Health check : http://localhost:${port}/health\n`);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      const nextPort = port + 1;
      console.warn(`[Server] Port ${port} is busy. Trying ${nextPort}...`);
      startServer(nextPort);
      return;
    }

    console.error('[Fatal] Server failed to start:', err);
    process.exit(1);
  });
}

initDB().then(() => {
  startServer(PORT);
}).catch(err => {
  console.error('[Fatal] Could not initialize database:', err);
  process.exit(1);
});
