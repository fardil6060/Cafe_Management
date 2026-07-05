# Cafe Management System

## Quick Start
```bash
npm install
npm start
```
Server runs at: http://localhost:3000

## Default Login
- Username: admin
- Password: admin1234

## Project Structure
```
cafe-system/
├── server/
│   ├── server.js       ← Entry point
│   ├── database.js     ← SQLite (sql.js) + schema
│   ├── data/cafe.db    ← Auto-created on first run
│   └── routes/
│       ├── auth.js
│       ├── menu.js
│       ├── orders.js
│       ├── tables.js
│       ├── inventory.js
│       ├── customers.js
│       ├── sales.js
│       └── qr.js
├── customer/           ← QR web app (Phase 4)
└── admin/              ← Admin panel (Phase 5-7)
```

## API Endpoints

### Auth
- POST /api/auth/login
- POST /api/auth/change-password

### Menu
- GET  /api/menu/full          ← all categories + available items
- GET  /api/menu/categories
- POST /api/menu/categories
- GET  /api/menu/items
- POST /api/menu/items
- PUT  /api/menu/items/:id
- DELETE /api/menu/items/:id

### Orders
- GET  /api/orders             ← filter by status, table_id, date
- POST /api/orders             ← place new order
- PUT  /api/orders/:id/status  ← update status

### Tables
- GET  /api/tables
- POST /api/tables
- PUT  /api/tables/:id
- GET  /api/tables/by-token/:token  ← used by QR scanner
- POST /api/tables/:id/regenerate-qr

### Inventory
- GET  /api/inventory
- GET  /api/inventory/low-stock
- PUT  /api/inventory/:id/stock
- POST /api/inventory/:id/restock

### Sales
- POST /api/sales/confirm       ← confirm payment
- GET  /api/sales/summary       ← today's summary
- GET  /api/sales/history       ← paginated history
- GET  /api/sales/revenue       ← weekly/monthly chart data
- GET  /api/sales/by-table      ← table breakdown

### QR
- GET  /api/qr/table/:id        ← QR code image (base64)
- GET  /api/qr/all              ← all tables QR codes
