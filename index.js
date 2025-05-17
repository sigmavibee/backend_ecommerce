const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');

const app = express();
const port = 10000;

// Middleware
app.use(cors());
app.use(express.json()); // Untuk parsing JSON body

// Konfigurasi koneksi PostgreSQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL, // Render otomatis sediakan ini
  ssl: { rejectUnauthorized: false } // Penting untuk koneksi eksternal
});


// Endpoint untuk test koneksi
app.get('/', (req, res) => {
  res.send('Welcome to backend ecommerce!');
});

// endpoint untuk mendapatkan data semua user
app.get('/special/users', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM users');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

// Start server
app.listen(port, () => {
  console.log(`Server berjalan di port ${port}`);
});