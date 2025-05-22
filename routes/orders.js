module.exports = (pool, helpers, authenticateJWT) => {
  const router = require('express').Router();

  router.use(authenticateJWT);

  router.post('/', async (req, res) => {
    if (req.user.role !== 'customer') {
      return res.status(403).json({ message: 'Customer access required' });
    }

    const { items, shipping_address, payment_method } = req.body;
    const client = await pool.connect();

    try {
      await client.query('BEGIN');
      let totalAmount = 0;

      // Calculate total and validate items
      for (const item of items) {
        const product = await client.query(
          'SELECT price, stock FROM products WHERE id = $1 AND is_active = true',
          [item.product_id]
        );
        if (!product.rows[0]) throw new Error('Invalid product');
        if (item.quantity > product.rows[0].stock) throw new Error('Insufficient stock');
        totalAmount += product.rows[0].price * item.quantity;
      }

      // Create order
      const order = await client.query(
        `INSERT INTO orders (user_id, total_amount, status, payment_method, shipping_address) 
         VALUES ($1, $2, 'pending', $3, $4) RETURNING id`,
        [req.user.id, totalAmount, payment_method || 'manual_transfer', shipping_address]
      );

      // Add order items
      for (const item of items) {
        const product = await client.query('SELECT price FROM products WHERE id = $1', [item.product_id]);
        await client.query(
          `INSERT INTO order_items (order_id, product_id, quantity, price) 
           VALUES ($1, $2, $3, $4)`,
          [order.rows[0].id, item.product_id, item.quantity, product.rows[0].price]
        );
        await client.query(
          'UPDATE products SET stock = stock - $1 WHERE id = $2',
          [item.quantity, item.product_id]
        );
      }

      await client.query('COMMIT');
      res.status(201).json({ message: 'Order created', orderId: order.rows[0].id });
    } catch (err) {
      await client.query('ROLLBACK');
      helpers.handleError(res, err, 'Order creation failed');
    } finally {
      client.release();
    }
  });

  // Admin routes
  router.put('/:id/status', async (req, res) => {
    if (!helpers.isAdmin(req)) return res.status(403).json({ message: 'Admin access required' });

    try {
      const result = await pool.query(
        `UPDATE orders SET status = $1, updated_at = NOW() 
         WHERE id = $2 RETURNING *`,
        [req.body.status, req.params.id]
      );
      res.json(result.rows[0] || { message: 'Order not found' });
    } catch (err) {
      helpers.handleError(res, err, 'Update status error');
    }
  });

  router.delete('/:id', async (req, res) => {
    if (!helpers.isAdmin(req)) return res.status(403).json({ message: 'Admin access required' });

    try {
      await pool.query('DELETE FROM orders WHERE id = $1', [req.params.id]);
      res.status(204).end();
    } catch (err) {
      helpers.handleError(res, err, 'Delete order error');
    }
  });

  return router;
};