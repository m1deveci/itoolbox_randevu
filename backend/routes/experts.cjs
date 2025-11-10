const express = require('express');
const router = express.Router();
const mysql = require('mysql2/promise');

// Create connection pool for ittoolbox database
const ittoolboxPool = mysql.createPool({
  host: process.env.ITTOOLBOX_DB_HOST || 'localhost',
  user: process.env.ITTOOLBOX_DB_USER || 'toolbox_native',
  password: process.env.ITTOOLBOX_DB_PASSWORD || 'GuvenliParola123!',
  database: process.env.ITTOOLBOX_DB_NAME || 'ittoolbox',
  waitForConnections: true,
  connectionLimit: 5,
  queueLimit: 0,
  timezone: '+03:00'
});

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

  // POST /api/experts/import - Import admin/superadmin users from ittoolbox database
  router.post('/import/from-ittoolbox', async (req, res) => {
    try {
      // Get all admin and superadmin users from ittoolbox database
      const [ittoolboxUsers] = await ittoolboxPool.execute(
        'SELECT id, name, email FROM users WHERE role IN (?, ?) AND email IS NOT NULL',
        ['admin', 'superadmin']
      );

      if (ittoolboxUsers.length === 0) {
        return res.status(400).json({ error: 'No admin users found in ittoolbox database' });
      }

      let imported = 0;
      let skipped = 0;
      const results = [];

      for (const user of ittoolboxUsers) {
        try {
          const [result] = await pool.execute(
            'INSERT INTO experts (name, email) VALUES (?, ?) ON DUPLICATE KEY UPDATE name = VALUES(name)',
            [user.name, user.email]
          );

          results.push({
            name: user.name,
            email: user.email,
            status: result.affectedRows > 0 ? 'imported' : 'updated'
          });

          if (result.affectedRows > 0) {
            imported++;
          } else {
            skipped++;
          }
        } catch (error) {
          if (error.code === 'ER_DUP_ENTRY') {
            skipped++;
            results.push({
              name: user.name,
              email: user.email,
              status: 'skipped'
            });
          } else {
            throw error;
          }
        }
      }

      res.json({
        message: 'Import completed successfully',
        imported,
        skipped,
        total: ittoolboxUsers.length,
        results
      });
    } catch (error) {
      console.error('Error importing experts:', error);
      res.status(500).json({ error: 'Failed to import experts from ittoolbox' });
    }
  });

  return router;
};
