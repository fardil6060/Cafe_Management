const express = require('express');
const cors    = require('cors');
const path    = require('path');
const { initDB } = require('./database');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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

initDB().then(() => {
  app.listen(PORT, () => {
    console.log(`\n✅ Cafe system running at http://localhost:${PORT}`);
    console.log(`   Admin panel : http://localhost:${PORT}/index.html`);
    console.log(`   Customer menu: http://localhost:${PORT}/menu?t=<token>`);
    console.log(`   Health check : http://localhost:${PORT}/health\n`);
  });
}).catch(err => {
  console.error('[Fatal] Could not initialize database:', err);
  process.exit(1);
});
