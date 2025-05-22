module.exports = (pool, helpers, tokenService, refreshTokens, authenticateJWT) => {
  const router = require('express').Router();

  router.post('/login', async (req, res) => {
    const { email, password } = req.body;
    try {
      const result = await pool.query(
        'SELECT id, name, email, role FROM users WHERE email = $1 AND password = $2',
        [email, password]
      );
      if (result.rows.length === 0) return res.status(401).json({ message: 'Invalid credentials' });

      const user = result.rows[0];
      const accessToken = tokenService.generateAccessToken(user);
      const refreshToken = tokenService.generateRefreshToken(user);
      refreshTokens.push(refreshToken);

      res.json({ user, token: accessToken, refreshToken });
    } catch (err) {
      helpers.handleError(res, err, 'Login error');
    }
  });

  router.post('/token', (req, res) => {
    const { refreshToken } = req.body;
    if (!refreshToken || !refreshTokens.includes(refreshToken)) {
      return res.status(403).json({ message: 'Refresh token not found, login again' });
    }

    jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET, (err, user) => {
      if (err) return res.status(403).json({ message: 'Invalid refresh token', error: err.message });
      res.json({ token: tokenService.generateAccessToken(user) });
    });
  });

  router.post('/logout', (req, res) => {
    refreshTokens = refreshTokens.filter(token => token !== req.body.refreshToken);
    res.status(204).end();
  });

  router.post('/register', async (req, res) => {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ message: 'All fields are required' });
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
        helpers.handleError(res, err, 'Registration error');
      }
    }
  });

   router.get('/user', authenticateJWT, async (req, res) => {
    try {
      const result = await pool.query(
        'SELECT id, name, email, role FROM users WHERE id = $1',
        [req.user.id]
      );
      res.json(result.rows[0] || { message: 'User not found' });
    } catch (err) {
      helpers.handleError(res, err, 'Get user error');
    }
  });

  return router;
};