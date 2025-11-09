const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');

// Create a separate connection pool for ittoolbox database
const mysql = require('mysql2/promise');
const ittoolboxPool = mysql.createPool({
  host: 'localhost',
  user: 'toolbox_native',
  password: 'GuvenliParola123!',
  database: 'ittoolbox',
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

    // Return user info (without password)
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
