const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');

// Create connection pools
const mysql = require('mysql2/promise');
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

const randevuPool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'randevu_user',
  password: process.env.DB_PASSWORD || 'randevu_pass_secure_2024',
  database: process.env.DB_NAME || 'ittoolbox_randevu',
  waitForConnections: true,
  connectionLimit: 5,
  queueLimit: 0,
  timezone: '+03:00'
});

// POST /api/auth/login - Authenticate user from ittoolbox database
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email ve şifre gereklidir' });
    }

    // Get user from ittoolbox database
    const [users] = await ittoolboxPool.execute(
      'SELECT id, name, email, password, role, avatar FROM users WHERE email = ? AND role IN (?, ?)',
      [email, 'admin', 'superadmin']
    );

    if (users.length === 0) {
      return res.status(401).json({ error: 'Email veya şifre yanlış' });
    }

    const user = users[0];

    // Compare password with bcrypt
    const passwordMatch = await bcrypt.compare(password, user.password);

    if (!passwordMatch) {
      return res.status(401).json({ error: 'Email veya şifre yanlış' });
    }

    // Add/update admin as expert in randevu database using the same ID from ittoolbox
    // This ensures ID consistency between ittoolbox users and randevu experts
    try {
      // Use INSERT ... ON DUPLICATE KEY UPDATE to ensure expert exists with same ID
      await randevuPool.execute(
        `INSERT INTO experts (id, name, email) VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE name = VALUES(name), email = VALUES(email)`,
        [user.id, user.name, user.email]
      );
    } catch (error) {
      console.error('Error syncing expert:', error);
      // Don't fail login if expert sync fails
    }

    // Return user info (without password)
    // expertId is same as id since we use the same ID from ittoolbox
    res.json({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      avatar: user.avatar,
      authenticated: true
    });
  } catch (error) {
    console.error('Error during login:', error);
    res.status(500).json({ error: 'Giriş yapılırken hata oluştu' });
  }
});

// POST /api/auth/logout - Logout (frontend handles session)
router.post('/logout', (req, res) => {
  res.json({ message: 'Çıkış başarılı' });
});

// GET /api/auth/me - Verify current session
router.get('/me', (req, res) => {
  const user = req.headers['x-user'];
  if (!user) {
    return res.status(401).json({ error: 'Oturum açılmamış' });
  }

  try {
    const userData = JSON.parse(user);
    res.json(userData);
  } catch (error) {
    res.status(401).json({ error: 'Geçersiz oturum' });
  }
});

module.exports = router;
