const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 4040;

// Middleware
app.use(cors());
app.use(express.json());

// Database Connection Pool
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'randevu_user',
  password: process.env.DB_PASSWORD || 'randevu_pass_secure_2024',
  database: process.env.DB_NAME || 'ittoolbox_randevu',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  timezone: '+03:00'
});

// Test database connection
pool.getConnection().then(conn => {
  console.log('✅ MySQL Database connected successfully');
  conn.release();
}).catch(err => {
  console.error('❌ Database connection failed:', err.message);
  process.exit(1);
});

// Import routes
const expertsRouter = require('./routes/experts.cjs');
const availabilityRouter = require('./routes/availability.cjs');
const appointmentsRouter = require('./routes/appointments.cjs');
const authRouter = require('./routes/auth.cjs');
const settingsRouter = require('./routes/settings.cjs');
const surveysRouter = require('./routes/surveys.cjs');
const notificationsRouter = require('./routes/notifications.cjs');

// Health check route
app.get('/api/health', async (req, res) => {
  try {
    const connection = await pool.getConnection();
    await connection.ping();
    connection.release();
    res.json({ status: 'ok', message: 'Server is running' });
  } catch (error) {
    res.status(500).json({ error: 'Database connection failed' });
  }
});

// Register routes
app.use('/api/auth', authRouter);
app.use('/api/experts', expertsRouter(pool));
app.use('/api/availability', availabilityRouter(pool));
app.use('/api/appointments', appointmentsRouter(pool));
app.use('/api/settings', settingsRouter(pool));
app.use('/api/surveys', surveysRouter(pool));
app.use('/api/notifications', notificationsRouter(pool));

// Basic error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
