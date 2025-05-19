const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();
const port = 10000;

// Middleware
app.use(cors());
app.use(express.json());

// PostgreSQL connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// In-memory store for refresh tokens (for demo)
let refreshTokens = [];

// Helper: log and send error
function handleError(res, err, message = 'Server error', status = 500) {
  console.error(message, err);
  res.status(status).json({ message, error: err.message || err });
}

// Helper: check admin
function isAdmin(req) {
  return req.user && req.user.role === 'admin';
}

// JWT Authentication Middleware
function authenticateJWT(req, res, next) {
  const token = req.headers['authorization'];
  if (!token) return res.status(401).json({ message: 'Access denied: No token' });

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ message: 'Invalid token', error: err.message });
    req.user = user;
    next();
  });
}

// Routes

// Health check
app.get('/', (req, res) => {
  res.send('Welcome to backend ecommerce!');
});

// Login
app.post('/login', async (req, res) => {
  if (!process.env.JWT_SECRET || !process.env.JWT_REFRESH_SECRET) {
    return res.status(500).json({ message: 'JWT secrets not configured' });
  }
  const { email, password } = req.body;
  try {
    const result = await pool.query(
      'SELECT id, name, email, role FROM users WHERE email = $1 AND password = $2',
      [email, password]
    );
    if (result.rows.length === 0) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }
    const user = result.rows[0];
    const accessToken = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );
    const refreshToken = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_REFRESH_SECRET,
      { expiresIn: '7d' }
    );
    refreshTokens.push(refreshToken);
    res.json({
      user,
      token: accessToken,
      refreshToken
    });
  } catch (err) {
    handleError(res, err, 'Login error');
  }
});

// Refresh token
app.post('/token', (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken || !refreshTokens.includes(refreshToken)) {
    return res.status(403).json({ message: 'Refresh token not found, login again' });
  }
  jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET, (err, user) => {
    if (err) return res.status(403).json({ message: 'Invalid refresh token', error: err.message });
    const accessToken = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );
    res.json({ token: accessToken });
  });
});

// Logout
app.post('/logout', (req, res) => {
  const { refreshToken } = req.body;
  refreshTokens = refreshTokens.filter(token => token !== refreshToken);
  res.status(204).end();
});

// Register
app.post('/register', async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ message: 'All fields are required', required: ['name', 'email', 'password'] });
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ message: 'Invalid email format' });
  }
  if (password.length < 6) {
    return res.status(400).json({ message: 'Password must be at least 6 characters' });
  }
  try {
    const result = await pool.query(
      'INSERT INTO users (name, email, password, role) VALUES ($1, $2, $3, $4) RETURNING id, name, email, role',
      [name, email, password, 'customer']
    );
    res.status(201).json({ message: 'Registration successful', user: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      res.status(400).json({ message: 'Email already registered' });
    } else {
      handleError(res, err, 'Registration error');
    }
  }
});

// Get logged-in user
app.get('/user', authenticateJWT, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, email, role FROM users WHERE id = $1',
      [req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    handleError(res, err, 'Get user error');
  }
});

// Products

// Get all active products
app.get('/products', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM products WHERE is_active = true');
    res.json(result.rows);
  } catch (err) {
    handleError(res, err, 'Get products error');
  }
});

// Create product (admin only)
app.post('/products', authenticateJWT, async (req, res) => {
  if (!isAdmin(req)) {
    return res.status(403).json({ message: 'Only admin can create products' });
  }
  const { name, description, price, stock, image_url } = req.body;
  if (!name || !description || !price || !stock || !image_url) {
    return res.status(400).json({ message: 'All fields are required' });
  }
  try {
    const result = await pool.query(
      `INSERT INTO products (name, description, price, stock, image_url) 
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [name, description, price, stock, image_url]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    handleError(res, err, 'Create product error');
  }
});

// Update product (admin only)
app.put('/products/:id', authenticateJWT, async (req, res) => {
  if (!isAdmin(req)) {
    return res.status(403).json({ message: 'Only admin can update products' });
  }
  const { id } = req.params;
  const { name, description, price, stock, image_url } = req.body;
  try {
    const result = await pool.query(
      `UPDATE products SET 
         name = $1, 
         description = $2, 
         price = $3, 
         stock = $4, 
         image_url = $5,
         updated_at = NOW()
       WHERE id = $6 RETURNING *`,
      [name, description, price, stock, image_url, id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Product not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    handleError(res, err, 'Update product error');
  }
});

// Delete product (soft delete, admin only)
app.delete('/products/:id', authenticateJWT, async (req, res) => {
  if (!isAdmin(req)) {
    return res.status(403).json({ message: 'Only admin can delete products' });
  }
  const { id } = req.params;
  try {
    await pool.query('UPDATE products SET is_active = false WHERE id = $1', [id]);
    res.status(204).end();
  } catch (err) {
    handleError(res, err, 'Delete product error');
  }
});

// Special endpoints (for debugging/admin)
app.get('/special/users', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM users');
    res.json(result.rows);
  } catch (err) {
    handleError(res, err, 'Get all users error');
  }
});

app.get('/special/products', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM products');
    res.json(result.rows);
  } catch (err) {
    handleError(res, err, 'Get all products error');
  }
});

// Start server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
