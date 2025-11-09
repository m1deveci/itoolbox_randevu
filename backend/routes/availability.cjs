const express = require('express');
const router = express.Router();

module.exports = (pool) => {
  // GET /api/availability - Get all availabilities
  router.get('/', async (req, res) => {
    try {
      const expertId = req.query.expertId;
      let query = `
        SELECT a.id, a.expert_id, a.day_of_week, a.start_time, a.end_time,
               e.name as expert_name, a.created_at
        FROM availability a
        JOIN experts e ON a.expert_id = e.id
      `;
      const params = [];

      if (expertId) {
        query += ' WHERE a.expert_id = ?';
        params.push(expertId);
      }

      query += ' ORDER BY a.expert_id, a.day_of_week, a.start_time';

      const [availabilities] = await pool.execute(query, params);
      res.json(availabilities);
    } catch (error) {
      console.error('Error fetching availabilities:', error);
      res.status(500).json({ error: 'Failed to fetch availabilities' });
    }
  });

  // GET /api/availability/:id - Get availability by ID
  router.get('/:id', async (req, res) => {
    try {
      const [availabilities] = await pool.execute(
        `SELECT a.id, a.expert_id, a.day_of_week, a.start_time, a.end_time,
                e.name as expert_name, a.created_at
         FROM availability a
         JOIN experts e ON a.expert_id = e.id
         WHERE a.id = ?`,
        [req.params.id]
      );

      if (availabilities.length === 0) {
        return res.status(404).json({ error: 'Availability not found' });
      }

      res.json(availabilities[0]);
    } catch (error) {
      console.error('Error fetching availability:', error);
      res.status(500).json({ error: 'Failed to fetch availability' });
    }
  });

  // POST /api/availability - Create new availability
  router.post('/', async (req, res) => {
    try {
      const { expertId, dayOfWeek, startTime, endTime } = req.body;

      // Validate input
      if (expertId === undefined || dayOfWeek === undefined || !startTime || !endTime) {
        return res.status(400).json({ error: 'All fields are required' });
      }

      if (dayOfWeek < 0 || dayOfWeek > 6) {
        return res.status(400).json({ error: 'Day of week must be 0-6' });
      }

      if (startTime >= endTime) {
        return res.status(400).json({ error: 'Start time must be before end time' });
      }

      // Check if expert exists
      const [experts] = await pool.execute(
        'SELECT id FROM experts WHERE id = ?',
        [expertId]
      );

      if (experts.length === 0) {
        return res.status(404).json({ error: 'Expert not found' });
      }

      const [result] = await pool.execute(
        'INSERT INTO availability (expert_id, day_of_week, start_time, end_time) VALUES (?, ?, ?, ?)',
        [expertId, dayOfWeek, startTime, endTime]
      );

      res.status(201).json({
        id: result.insertId,
        expertId,
        dayOfWeek,
        startTime,
        endTime,
        created_at: new Date().toISOString()
      });
    } catch (error) {
      if (error.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({ error: 'Availability already exists for this time slot' });
      }
      console.error('Error creating availability:', error);
      res.status(500).json({ error: 'Failed to create availability' });
    }
  });

  // PUT /api/availability/:id - Update availability
  router.put('/:id', async (req, res) => {
    try {
      const { dayOfWeek, startTime, endTime } = req.body;

      if (dayOfWeek === undefined || !startTime || !endTime) {
        return res.status(400).json({ error: 'All fields are required' });
      }

      if (dayOfWeek < 0 || dayOfWeek > 6) {
        return res.status(400).json({ error: 'Day of week must be 0-6' });
      }

      if (startTime >= endTime) {
        return res.status(400).json({ error: 'Start time must be before end time' });
      }

      const [result] = await pool.execute(
        'UPDATE availability SET day_of_week = ?, start_time = ?, end_time = ? WHERE id = ?',
        [dayOfWeek, startTime, endTime, req.params.id]
      );

      if (result.affectedRows === 0) {
        return res.status(404).json({ error: 'Availability not found' });
      }

      res.json({
        id: req.params.id,
        dayOfWeek,
        startTime,
        endTime
      });
    } catch (error) {
      if (error.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({ error: 'Availability already exists for this time slot' });
      }
      console.error('Error updating availability:', error);
      res.status(500).json({ error: 'Failed to update availability' });
    }
  });

  // DELETE /api/availability/:id - Delete availability
  router.delete('/:id', async (req, res) => {
    try {
      const [result] = await pool.execute(
        'DELETE FROM availability WHERE id = ?',
        [req.params.id]
      );

      if (result.affectedRows === 0) {
        return res.status(404).json({ error: 'Availability not found' });
      }

      res.json({ message: 'Availability deleted successfully' });
    } catch (error) {
      console.error('Error deleting availability:', error);
      res.status(500).json({ error: 'Failed to delete availability' });
    }
  });

  return router;
};
