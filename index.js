const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');

const app = express();
const port = 3000;

// Middleware
app.use(cors());
app.use(express.json()); // Untuk parsing JSON body

// Konfigurasi koneksi PostgreSQL
const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'ecommerce_db',
  password: 'rebana123',
  port: 5432,
});

// Endpoint untuk test koneksi
app.get('/', (req, res) => {
  res.send('Welcome to backend ecommerce!');
});


// Start server
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});