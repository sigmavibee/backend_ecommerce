require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const upload = multer({ dest: 'uploads/' });
const authenticateJWT = require('./middlewares/auth'); // Use middleware from file
// Initialize app
const app = express();
const port = process.env.PORT || 10000;

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static('uploads'));

// Helpers
const helpers = {
  handleError: (res, err, message = 'Server error', status = 500) => {
    console.error(message, err);
    res.status(status).json({ message, error: err.message || err });
  },
  isAdmin: (req) => req.user && req.user.role === 'admin'
};


// Auth Middleware is now imported from './middlewares/auth'

// Token Management
const refreshTokens = [];
const tokenService = {
  generateAccessToken: (user) => jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  ),
  generateRefreshToken: (user) => jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: '7d' }
  )
};

// Routes
const routes = {
  auth: require('./routes/auth')(pool, helpers, tokenService, refreshTokens, authenticateJWT),
  products: require('./routes/products')(pool, helpers, authenticateJWT),
  orders: require('./routes/orders')(pool, helpers, authenticateJWT),
  upload: require('./routes/upload')(upload)
};

// Mount routes
app.use('/auth', routes.auth);
app.use('/products', routes.products);
app.use('/orders', routes.orders);
app.use('/upload', routes.upload);

// Health check
app.get('/', (req, res) => res.send('Welcome to backend ecommerce!'));

// Start server
app.listen(port, () => console.log(`Server running on port ${port}`));app.get('/', (_, res) => res.send('Welcome to backend ecommerce!'));
