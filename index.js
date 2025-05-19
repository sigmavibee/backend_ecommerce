const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const multer = require('multer');
const upload = multer({ dest: 'uploads/' });

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

//get product by id
app.get('/products/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query('SELECT * FROM products WHERE id = $1 AND is_active = true', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Product not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    handleError(res, err, 'Get product by ID error');
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

// Serve static files from the uploads directory
app.use('/uploads', express.static('uploads'));

app.post('/api/upload', upload.single('image'), (req, res) => {
  const imageUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
  res.json({ imageUrl });
});

//Orders section
// Create order
app.post('/orders', authenticateJWT, async (req, res) => {
  if (req.user.role !== 'customer') {
    return res.status(403).json({ message: 'Only customers can create orders' });
  }

  const { items, shipping_address, payment_method } = req.body;

  if (!items || !Array.isArray(items) || items.length === 0 || !shipping_address) {
    return res.status(400).json({ message: 'Missing required order fields' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    let totalAmount = 0;

    // Calculate total amount
    for (const item of items) {
      const result = await client.query(
        'SELECT price, stock FROM products WHERE id = $1 AND is_active = true',
        [item.product_id]
      );
      if (result.rows.length === 0) throw new Error('Invalid product');
      const { price, stock } = result.rows[0];
      if (item.quantity > stock) throw new Error('Insufficient stock');
      totalAmount += price * item.quantity;
    }

    // Insert order into table
    const orderResult = await client.query(
      `INSERT INTO orders (user_id, total_amount, status, payment_method, shipping_address, created_at, updated_at) 
       VALUES ($1, $2, 'pending', $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) 
       RETURNING id`,
      [req.user.id, totalAmount, payment_method || 'manual_transfer', shipping_address]
    );

    const orderId = orderResult.rows[0].id;

    // Insert order_items (you must already have this table created)
    for (const item of items) {
      const result = await client.query('SELECT price FROM products WHERE id = $1', [item.product_id]);
      const price = result.rows[0].price;

      await client.query(
        `INSERT INTO order_items (order_id, product_id, quantity, price) 
         VALUES ($1, $2, $3, $4)`,
        [orderId, item.product_id, item.quantity, price]
      );

      // Optional: reduce stock
      await client.query(
        'UPDATE products SET stock = stock - $1 WHERE id = $2',
        [item.quantity, item.product_id]
      );
    }

    await client.query('COMMIT');
    res.status(201).json({ message: 'Order created successfully', orderId });
  } catch (err) {
    await client.query('ROLLBACK');
    handleError(res, err, 'Order creation failed');
  } finally {
    client.release();
  }
});

// 🔄 Update Order Status Route (Admin)
app.put('/orders/:id/status', authenticateJWT, async (req, res) => {
  if (!isAdmin(req)) {
    return res.status(403).json({ message: 'Admins only' });
  }

  const { id } = req.params;
  const { status } = req.body;

  try {
    const result = await pool.query(
      `UPDATE orders SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *`,
      [status, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Order not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    handleError(res, err, 'Update status error');
  }
});

// Admin Delete Order
app.delete('/orders/:id', authenticateJWT, async (req, res) => {
  if (!isAdmin(req)) {
    return res.status(403).json({ message: 'Admins only' });
  }

  try {
    await pool.query('DELETE FROM orders WHERE id = $1', [req.params.id]);
    res.status(204).end();
  } catch (err) {
    handleError(res, err, 'Delete order error');
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
