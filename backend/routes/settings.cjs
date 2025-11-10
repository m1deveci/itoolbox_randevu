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
      
      // Insert or update setting (ON DUPLICATE KEY UPDATE)
      await pool.execute(
        `INSERT INTO settings (key_name, value) VALUES (?, ?)
         ON DUPLICATE KEY UPDATE value = VALUES(value)`,
        [req.params.key, value]
      );
      
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

  // POST /api/settings/test-smtp - Test SMTP connection
  router.post('/test-smtp', async (req, res) => {
    try {
      const { smtp_enabled, smtp_host, smtp_port, smtp_user, smtp_password, smtp_from_email, smtp_from_name, testEmail } = req.body;
      const userId = req.headers['x-user-id'] || null;
      const userName = req.headers['x-user-name'] || 'System';

      if (smtp_enabled !== 'true') {
        return res.status(400).json({ error: 'SMTP is not enabled' });
      }

      if (!smtp_host || !smtp_port || !smtp_user || !smtp_from_email) {
        return res.status(400).json({ error: 'SMTP host, port, user, and from email are required' });
      }

      // Try to connect to SMTP server
      const nodemailer = require('nodemailer');

      const transporter = nodemailer.createTransport({
        host: smtp_host,
        port: parseInt(smtp_port) || 587,
        secure: parseInt(smtp_port) === 465, // true for 465, false for other ports
        auth: {
          user: smtp_user,
          pass: smtp_password
        },
        tls: {
          rejectUnauthorized: false // For self-signed certificates
        }
      });

      // Verify connection
      await transporter.verify();

      // Fetch site title from database
      let siteTitle = 'IT Randevu Sistemi';
      try {
        const [result] = await pool.execute(
          'SELECT value FROM settings WHERE key_name = ?',
          ['site_title']
        );
        if (result.length > 0) {
          siteTitle = result[0].value || 'IT Randevu Sistemi';
        }
      } catch (error) {
        console.error('Error fetching site title:', error);
      }

      // Determine test email recipient
      const emailRecipient = testEmail || smtp_from_email;

      // Try to send a test email
      const testEmailOptions = {
        from: `"${smtp_from_name || 'IT Randevu Sistemi'}" <${smtp_from_email}>`,
        to: emailRecipient,
        subject: `${siteTitle} - SMTP Bağlantı Testi`,
        text: `Merhaba,\n\nBu bir test e-postasıdır. SMTP ayarlarınız doğru şekilde yapılandırılmış ve çalışıyor.\n\n${siteTitle}`,
        html: `<p>Merhaba,</p><p>Bu bir test e-postasıdır. SMTP ayarlarınız doğru şekilde yapılandırılmış ve çalışıyor.</p><p><strong>${siteTitle}</strong></p>`
      };

      await transporter.sendMail(testEmailOptions);

      // Log activity
      await pool.execute(
        `INSERT INTO activity_logs (user_id, user_name, action, entity_type, details, ip_address, user_agent)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          userId,
          userName,
          'test_smtp',
          'settings',
          JSON.stringify({ smtp_host, smtp_port, smtp_user, smtp_from_email, test_email_recipient: emailRecipient }),
          req.ip || req.headers['x-forwarded-for'] || 'unknown',
          req.headers['user-agent'] || 'unknown'
        ]
      );

      res.json({
        message: `SMTP bağlantısı başarıyla test edildi ve test e-postası ${emailRecipient} adresine gönderildi`,
        success: true,
        sentTo: emailRecipient
      });
    } catch (error) {
      console.error('Error testing SMTP:', error);
      
      // Log failed test
      const userId = req.headers['x-user-id'] || null;
      const userName = req.headers['x-user-name'] || 'System';
      try {
        await pool.execute(
          `INSERT INTO activity_logs (user_id, user_name, action, entity_type, details, ip_address, user_agent)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            userId,
            userName,
            'test_smtp_failed',
            'settings',
            JSON.stringify({ error: error.message }),
            req.ip || req.headers['x-forwarded-for'] || 'unknown',
            req.headers['user-agent'] || 'unknown'
          ]
        );
      } catch (logError) {
        console.error('Error logging failed SMTP test:', logError);
      }

      res.status(500).json({ 
        error: error.message || 'SMTP bağlantısı test edilemedi',
        details: error.code || 'UNKNOWN_ERROR'
      });
    }
  });

  return router;
};

