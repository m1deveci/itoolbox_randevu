const express = require('express');
const router = express.Router();

module.exports = (pool) => {
  // GET /api/experts - Get all experts
  router.get('/', async (req, res) => {
    try {
      const [experts] = await pool.execute(
        'SELECT id, name, email, created_at FROM experts ORDER BY name'
      );
      res.json(experts);
    } catch (error) {
      console.error('Error fetching experts:', error);
      res.status(500).json({ error: 'Failed to fetch experts' });
    }
  });

  // GET /api/experts/:id - Get expert by ID
  router.get('/:id', async (req, res) => {
    try {
      const [experts] = await pool.execute(
        'SELECT id, name, email, created_at FROM experts WHERE id = ?',
        [req.params.id]
      );

      if (experts.length === 0) {
        return res.status(404).json({ error: 'Expert not found' });
      }

      res.json(experts[0]);
    } catch (error) {
      console.error('Error fetching expert:', error);
      res.status(500).json({ error: 'Failed to fetch expert' });
    }
  });

  // POST /api/experts - Create new expert
  router.post('/', async (req, res) => {
    try {
      const { name, email } = req.body;

      // Validate input
      if (!name || !email) {
        return res.status(400).json({ error: 'Name and email are required' });
      }

      if (!email.includes('@')) {
        return res.status(400).json({ error: 'Invalid email format' });
      }

      const [result] = await pool.execute(
        'INSERT INTO experts (name, email) VALUES (?, ?)',
        [name, email]
      );

      res.status(201).json({
        id: result.insertId,
        name,
        email,
        created_at: new Date().toISOString()
      });
    } catch (error) {
      if (error.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({ error: 'Email already exists' });
      }
      console.error('Error creating expert:', error);
      res.status(500).json({ error: 'Failed to create expert' });
    }
  });

  // PUT /api/experts/:id - Update expert
  router.put('/:id', async (req, res) => {
    try {
      const { name, email } = req.body;

      if (!name || !email) {
        return res.status(400).json({ error: 'Name and email are required' });
      }

      if (!email.includes('@')) {
        return res.status(400).json({ error: 'Invalid email format' });
      }

      const [result] = await pool.execute(
        'UPDATE experts SET name = ?, email = ? WHERE id = ?',
        [name, email, req.params.id]
      );

      if (result.affectedRows === 0) {
        return res.status(404).json({ error: 'Expert not found' });
      }

      res.json({
        id: req.params.id,
        name,
        email
      });
    } catch (error) {
      if (error.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({ error: 'Email already exists' });
      }
      console.error('Error updating expert:', error);
      res.status(500).json({ error: 'Failed to update expert' });
    }
  });

  // DELETE /api/experts/:id - Delete expert
  router.delete('/:id', async (req, res) => {
    try {
      const [result] = await pool.execute(
        'DELETE FROM experts WHERE id = ?',
        [req.params.id]
      );

      if (result.affectedRows === 0) {
        return res.status(404).json({ error: 'Expert not found' });
      }

      res.json({ message: 'Expert deleted successfully' });
    } catch (error) {
      console.error('Error deleting expert:', error);
      res.status(500).json({ error: 'Failed to delete expert' });
    }
  });

  return router;
};
