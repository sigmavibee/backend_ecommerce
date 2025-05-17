const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config();

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

// Endpoint untuk login
app.post('/login', async (req, res) => {
  const { username, password } = req.body;

  try {
    const result = await pool.query('SELECT * FROM users WHERE username = $1 AND password = $2', [username, password]);
    
    if (result.rows.length > 0) {
      const user = result.rows[0];
      const token = jwt.sign({ id: user.id, username: user.username }, process.env.JWT_SECRET, { expiresIn: '1h' });
      res.json({ token });
    } else {
      res.status(401).send('Invalid credentials');
    }
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

// Endpoint untuk register user baru
app.post('/register', async (req, res) => {
  const { name, email, password } = req.body;

  try {
    const result = await pool.query(
      'INSERT INTO users (name, email, password, role) VALUES ($1, $2, $3, $4) RETURNING *',
      [name, email, password, 'user']
    );
    const newUser = result.rows[0];
    res.status(201).json(newUser);
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

// Middleware untuk autentikasi JWT
const authenticateJWT = (req, res, next) => {
  const token = req.headers['authorization'];

  if (!token) {
    return res.status(401).send('Access denied');
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).send('Invalid token');
    }
    req.user = user;
    next();
  });
};

// Endpoint untuk mendapatkan data user yang sudah login
app.get('/user', authenticateJWT, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM users WHERE id = $1', [req.user.id]);
    if (result.rows.length > 0) {
      res.json(result.rows[0]);
    } else {
      res.status(404).send('User not found');
    }
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
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

// endpoint untuk mendapatkan data semua produk
app.get('/special/products', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM products');
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