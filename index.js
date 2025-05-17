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
  const { email, password } = req.body;

  try {
    const result = await pool.query(
      'SELECT id, name, email, role FROM users WHERE email = $1 AND password = $2', 
      [email, password]
    );
    
    if (result.rows.length > 0) {
      const user = result.rows[0];
      const token = jwt.sign(
        { id: user.id, email: user.email }, 
        process.env.JWT_SECRET, 
        { expiresIn: '1h' }
      );
      
      // Return both user data and token in the expected format
      res.json({
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role
        },
        token: token
      });
    } else {
      res.status(401).json({ message: 'Invalid credentials' });
    }
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ 
      message: 'Server error',
      error: err.message // Include error details for debugging
    });
  }
});

// Endpoint untuk register user baru
app.post('/register', async (req, res) => {
  const { name, email, password } = req.body;

  // Enhanced validation
  if (!name || !email || !password) {
    return res.status(400).json({ 
      message: 'All fields are required',
      required: ['name', 'email', 'password'] 
    });
  }

  // Email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ message: 'Invalid email format' });
  }

  // Password length check
  if (password.length < 6) {
    return res.status(400).json({ message: 'Password must be at least 6 characters' });
  }

  try {
    const result = await pool.query(
      'INSERT INTO users (name, email, password, role) VALUES ($1, $2, $3, $4) RETURNING id, name, email, role',
      [name, email, password, 'customer'] // Store plain password (not recommended for production)
    );
    
    res.status(201).json({
      message: 'Registration successful',
      user: result.rows[0]
    });
    
  } catch (err) {
    console.error('Registration error:', err);
    
    if (err.code === '23505') { // Unique violation (duplicate email)
      res.status(400).json({ message: 'Email already registered' });
    } else {
      res.status(500).json({ message: 'Server error during registration' });
    }
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