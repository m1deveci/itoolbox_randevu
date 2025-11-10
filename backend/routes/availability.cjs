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
      const { expertId, dayOfWeek, startTime, endTime, adminName, adminEmail } = req.body;

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

      // Check for overlapping availabilities
      const [overlapping] = await pool.execute(
        `SELECT id FROM availability 
         WHERE expert_id = ? AND day_of_week = ? 
         AND (
           (start_time <= ? AND end_time > ?) OR
           (start_time < ? AND end_time >= ?) OR
           (start_time >= ? AND end_time <= ?)
         )`,
        [expertId, dayOfWeek, startTime, startTime, endTime, endTime, startTime, endTime]
      );

      if (overlapping.length > 0) {
        return res.status(409).json({ 
          error: 'Bu saat aralığı mevcut bir müsaitlik ile çakışıyor' 
        });
      }

      // Auto-create expert if not exists (for logged-in admins from ittoolbox)
      const expertName = adminName || 'Admin User';
      const expertEmail = adminEmail || `admin_${expertId}@example.com`;
      
      let finalExpertId = expertId;
      
      // First, try to find expert by ID
      let [existingExperts] = await pool.execute(
        'SELECT id FROM experts WHERE id = ?',
        [expertId]
      );
      
      // If not found by ID, try to find by email (in case ID mismatch)
      if (existingExperts.length === 0 && expertEmail) {
        [existingExperts] = await pool.execute(
          'SELECT id FROM experts WHERE email = ?',
          [expertEmail]
        );
        if (existingExperts.length > 0) {
          finalExpertId = existingExperts[0].id;
        }
      }
      
      // If still not found, create new expert (let database assign ID if ID conflict)
      if (existingExperts.length === 0) {
        try {
          // Try to insert with provided ID first
          try {
            await pool.execute(
              'INSERT INTO experts (id, name, email) VALUES (?, ?, ?)',
              [expertId, expertName, expertEmail]
            );
            finalExpertId = expertId;
          } catch (idError) {
            // If ID conflict, insert without ID (let AUTO_INCREMENT handle it)
            if (idError.code === 'ER_DUP_ENTRY' || idError.errno === 1062) {
              const [result] = await pool.execute(
                'INSERT INTO experts (name, email) VALUES (?, ?)',
                [expertName, expertEmail]
              );
              finalExpertId = result.insertId;
            } else {
              throw idError;
            }
          }
        } catch (error) {
          // If expert creation fails, return error instead of continuing
          console.error('Error creating expert:', error);
          return res.status(400).json({ 
            error: 'Expert not found and could not be created. Please create the expert first.' 
          });
        }
      }

      const [result] = await pool.execute(
        'INSERT INTO availability (expert_id, day_of_week, start_time, end_time) VALUES (?, ?, ?, ?)',
        [finalExpertId, dayOfWeek, startTime, endTime]
      );

      res.status(201).json({
        id: result.insertId,
        expertId: finalExpertId,
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

  // POST /api/availability/setup/all-experts - Auto-setup availability for all experts
  router.post('/setup/all-experts', async (req, res) => {
    try {
      // Get all experts
      const [experts] = await pool.execute('SELECT id FROM experts');

      if (experts.length === 0) {
        return res.status(400).json({ error: 'No experts found' });
      }

      // Define setup: Pazartesi-Cuma (1-5), Morning (09:00-11:00), Afternoon (13:00-16:00)
      const timeSlots = [
        { startTime: '09:00', endTime: '11:00' }, // Morning
        { startTime: '13:00', endTime: '16:00' }  // Afternoon
      ];

      let createdCount = 0;
      let skippedCount = 0;

      for (const expert of experts) {
        // Pazartesi (1) to Cuma (5)
        for (let day = 1; day <= 5; day++) {
          for (const slot of timeSlots) {
            try {
              await pool.execute(
                'INSERT INTO availability (expert_id, day_of_week, start_time, end_time) VALUES (?, ?, ?, ?)',
                [expert.id, day, slot.startTime, slot.endTime]
              );
              createdCount++;
            } catch (error) {
              if (error.code === 'ER_DUP_ENTRY') {
                skippedCount++;
              } else {
                throw error;
              }
            }
          }
        }
      }

      res.json({
        message: 'Auto-setup completed successfully',
        created: createdCount,
        skipped: skippedCount,
        experts: experts.length,
        totalSlots: experts.length * 5 * timeSlots.length
      });
    } catch (error) {
      console.error('Error during auto-setup:', error);
      res.status(500).json({ error: 'Failed to setup availability' });
    }
  });

  return router;
};
