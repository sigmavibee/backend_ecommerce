module.exports = (pool, helpers, authenticateJWT) => {
  const router = require('express').Router();

  router.get('/', async (req, res) => {
    try {
      const result = await pool.query('SELECT * FROM products WHERE is_active = true');
      res.json(result.rows);
    } catch (err) {
      helpers.handleError(res, err, 'Get products error');
    }
  });

  router.get('/:id', async (req, res) => {
    try {
      const result = await pool.query('SELECT * FROM products WHERE id = $1 AND is_active = true', [req.params.id]);
      res.json(result.rows[0] || { message: 'Product not found' });
    } catch (err) {
      helpers.handleError(res, err, 'Get product error');
    }
  });

  // Admin routes
  router.use(authenticateJWT);

  router.post('/', async (req, res) => {
    if (!helpers.isAdmin(req)) return res.status(403).json({ message: 'Admin access required' });

    const { name, description, price, stock, image_url } = req.body;
    try {
      const result = await pool.query(
        `INSERT INTO products (name, description, price, stock, image_url) 
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [name, description, price, stock, image_url]
      );
      res.status(201).json(result.rows[0]);
    } catch (err) {
      helpers.handleError(res, err, 'Create product error');
    }
  });

  router.put('/:id', async (req, res) => {
    if (!helpers.isAdmin(req)) return res.status(403).json({ message: 'Admin access required' });

    const { id } = req.params;
    const { name, description, price, stock, image_url } = req.body;
    try {
      const result = await pool.query(
        `UPDATE products SET 
           name = $1, description = $2, price = $3, 
           stock = $4, image_url = $5, updated_at = NOW()
         WHERE id = $6 RETURNING *`,
        [name, description, price, stock, image_url, id]
      );
      res.json(result.rows[0] || { message: 'Product not found' });
    } catch (err) {
      helpers.handleError(res, err, 'Update product error');
    }
  });

  router.delete('/:id', async (req, res) => {
    if (!helpers.isAdmin(req)) return res.status(403).json({ message: 'Admin access required' });

    try {
      await pool.query('UPDATE products SET is_active = false WHERE id = $1', [req.params.id]);
      res.status(204).end();
    } catch (err) {
      helpers.handleError(res, err, 'Delete product error');
    }
  });

  return router;
};