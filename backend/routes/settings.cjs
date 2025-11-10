const express = require('express');
const router = express.Router();

module.exports = (pool) => {
  // GET /api/settings - Get all settings
  router.get('/', async (req, res) => {
    try {
      const [settings] = await pool.execute(
        'SELECT key_name, value, description FROM settings ORDER BY key_name'
      );
      
      // Convert array to object
      const settingsObj = {};
      settings.forEach(setting => {
        settingsObj[setting.key_name] = {
          value: setting.value,
          description: setting.description
        };
      });
      
      res.json(settingsObj);
    } catch (error) {
      console.error('Error fetching settings:', error);
      res.status(500).json({ error: 'Failed to fetch settings' });
    }
  });

  // GET /api/settings/:key - Get specific setting
  router.get('/:key', async (req, res) => {
    try {
      const [settings] = await pool.execute(
        'SELECT value, description FROM settings WHERE key_name = ?',
        [req.params.key]
      );
      
      if (settings.length === 0) {
        return res.status(404).json({ error: 'Setting not found' });
      }
      
      res.json({
        value: settings[0].value,
        description: settings[0].description
      });
    } catch (error) {
      console.error('Error fetching setting:', error);
      res.status(500).json({ error: 'Failed to fetch setting' });
    }
  });

  // PUT /api/settings/:key - Update setting
  router.put('/:key', async (req, res) => {
    try {
      const { value } = req.body;
      const userId = req.headers['x-user-id'] || null;
      const userName = req.headers['x-user-name'] || 'System';
      
      // Update setting
      const [result] = await pool.execute(
        'UPDATE settings SET value = ? WHERE key_name = ?',
        [value, req.params.key]
      );
      
      if (result.affectedRows === 0) {
        return res.status(404).json({ error: 'Setting not found' });
      }
      
      // Log activity
      await pool.execute(
        `INSERT INTO activity_logs (user_id, user_name, action, entity_type, entity_id, details, ip_address, user_agent)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          userId,
          userName,
          'update_setting',
          'settings',
          null,
          JSON.stringify({ key: req.params.key, value }),
          req.ip || req.headers['x-forwarded-for'] || 'unknown',
          req.headers['user-agent'] || 'unknown'
        ]
      );
      
      res.json({ message: 'Setting updated successfully' });
    } catch (error) {
      console.error('Error updating setting:', error);
      res.status(500).json({ error: 'Failed to update setting' });
    }
  });

  // GET /api/settings/activity-logs - Get activity logs
  router.get('/activity-logs/list', async (req, res) => {
    try {
      const { page = 1, limit = 50, action, user_id } = req.query;
      const offset = (parseInt(page) - 1) * parseInt(limit);
      
      let query = 'SELECT * FROM activity_logs WHERE 1=1';
      const params = [];
      
      if (action) {
        query += ' AND action = ?';
        params.push(action);
      }
      
      if (user_id) {
        query += ' AND user_id = ?';
        params.push(user_id);
      }
      
      query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
      params.push(parseInt(limit), offset);
      
      const [logs] = await pool.execute(query, params);
      
      // Get total count
      let countQuery = 'SELECT COUNT(*) as total FROM activity_logs WHERE 1=1';
      const countParams = [];
      
      if (action) {
        countQuery += ' AND action = ?';
        countParams.push(action);
      }
      
      if (user_id) {
        countQuery += ' AND user_id = ?';
        countParams.push(user_id);
      }
      
      const [countResult] = await pool.execute(countQuery, countParams);
      const total = countResult[0].total;
      
      res.json({
        logs,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit))
        }
      });
    } catch (error) {
      console.error('Error fetching activity logs:', error);
      res.status(500).json({ error: 'Failed to fetch activity logs' });
    }
  });

  // POST /api/settings/activity-logs - Create activity log
  router.post('/activity-logs', async (req, res) => {
    try {
      const { user_id, user_name, action, entity_type, entity_id, details } = req.body;
      
      await pool.execute(
        `INSERT INTO activity_logs (user_id, user_name, action, entity_type, entity_id, details, ip_address, user_agent)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          user_id || null,
          user_name || 'System',
          action,
          entity_type || null,
          entity_id || null,
          details ? JSON.stringify(details) : null,
          req.ip || req.headers['x-forwarded-for'] || 'unknown',
          req.headers['user-agent'] || 'unknown'
        ]
      );
      
      res.json({ message: 'Activity log created successfully' });
    } catch (error) {
      console.error('Error creating activity log:', error);
      res.status(500).json({ error: 'Failed to create activity log' });
    }
  });

  return router;
};

