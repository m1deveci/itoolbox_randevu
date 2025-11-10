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

// POST /api/auth/login - Authenticate user from ittoolbox_randevu experts table
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email ve şifre gereklidir' });
    }

    // Get user from ittoolbox_randevu experts table (single source of truth)
    const [users] = await randevuPool.execute(
      'SELECT id, name, email, password_hash, role FROM experts WHERE email = ? AND role IN (?, ?)',
      [email, 'admin', 'superadmin']
    );

    if (users.length === 0) {
      return res.status(401).json({ error: 'Email veya şifre yanlış' });
    }

    const user = users[0];

    // Compare password with bcrypt
    if (!user.password_hash) {
      return res.status(401).json({ error: 'Şifre tanımlanmamış' });
    }

    const passwordMatch = await bcrypt.compare(password, user.password_hash);

    if (!passwordMatch) {
      return res.status(401).json({ error: 'Email veya şifre yanlış' });
    }

    // Return user info (without password)
    // Role comes from experts table (single source of truth)
    res.json({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
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
