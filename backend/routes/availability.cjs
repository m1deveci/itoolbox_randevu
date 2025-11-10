const express = require('express');
const router = express.Router();

module.exports = (pool) => {
  // GET /api/availability - Get all availabilities
  router.get('/', async (req, res) => {
    try {
      const expertId = req.query.expertId;
      let query = `
        SELECT a.id, a.expert_id, a.availability_date, a.start_time, a.end_time,
               e.name as expert_name, a.created_at
        FROM availability a
        JOIN experts e ON a.expert_id = e.id
      `;
      const params = [];

      if (expertId) {
        query += ' WHERE a.expert_id = ?';
        params.push(expertId);
      }

      query += ' ORDER BY a.expert_id, a.availability_date, a.start_time';

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
        `SELECT a.id, a.expert_id, a.availability_date, a.start_time, a.end_time,
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
      const { expertId, availabilityDate, startTime, endTime, adminName, adminEmail } = req.body;

      // Validate input
      if (expertId === undefined || !availabilityDate || !startTime || !endTime) {
        return res.status(400).json({ error: 'All fields are required' });
      }

      // Validate date format
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(availabilityDate)) {
        return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD' });
      }

      if (startTime >= endTime) {
        return res.status(400).json({ error: 'Start time must be before end time' });
      }

      // Check for exact duplicate (same startTime for same date)
      console.log('Checking duplicate - expertId:', expertId, 'availabilityDate:', availabilityDate, 'startTime:', startTime, 'type:', typeof availabilityDate);
      const [duplicate] = await pool.execute(
        `SELECT id, availability_date FROM availability
         WHERE expert_id = ? AND availability_date = ? AND start_time = ?`,
        [expertId, availabilityDate, startTime]
      );
      console.log('Duplicate check result:', duplicate);

      if (duplicate.length > 0) {
        console.log('Duplicate found:', duplicate);
        return res.status(409).json({
          error: 'Bu saat zaten müsaitlik olarak tanımlı'
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

      console.log('Inserting availability - expertId:', finalExpertId, 'availabilityDate:', availabilityDate, 'startTime:', startTime, 'endTime:', endTime);
      const [result] = await pool.execute(
        'INSERT INTO availability (expert_id, availability_date, start_time, end_time) VALUES (?, ?, ?, ?)',
        [finalExpertId, availabilityDate, startTime, endTime]
      );
      console.log('Insert result:', result);

      // Log activity
      const userId = req.headers['x-user-id'] ? parseInt(req.headers['x-user-id']) : null;
      const userName = req.headers['x-user-name'] || adminName || 'System';

      try {
        // Get expert name for log
        const [expertData] = await pool.execute(
          'SELECT name FROM experts WHERE id = ?',
          [finalExpertId]
        );
        const expertName = expertData.length > 0 ? expertData[0].name : 'Unknown';

        await pool.execute(
          `INSERT INTO activity_logs (user_id, user_name, action, entity_type, entity_id, details, ip_address, user_agent)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            userId,
            userName,
            'add_availability',
            'availability',
            result.insertId,
            JSON.stringify({
              availability_id: result.insertId,
              expert_id: finalExpertId,
              expert_name: expertName,
              availability_date: availabilityDate,
              start_time: startTime,
              end_time: endTime
            }),
            req.ip || req.headers['x-forwarded-for'] || 'unknown',
            req.headers['user-agent'] || 'unknown'
          ]
        );
      } catch (logError) {
        console.error('Error logging activity:', logError);
        // Don't fail the request if logging fails
      }

      res.status(201).json({
        id: result.insertId,
        expertId: finalExpertId,
        availabilityDate,
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
      const { availabilityDate, startTime, endTime } = req.body;

      if (!availabilityDate || !startTime || !endTime) {
        return res.status(400).json({ error: 'All fields are required' });
      }

      // Validate date format
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(availabilityDate)) {
        return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD' });
      }

      if (startTime >= endTime) {
        return res.status(400).json({ error: 'Start time must be before end time' });
      }

      const [result] = await pool.execute(
        'UPDATE availability SET availability_date = ?, start_time = ?, end_time = ? WHERE id = ?',
        [availabilityDate, startTime, endTime, req.params.id]
      );

      if (result.affectedRows === 0) {
        return res.status(404).json({ error: 'Availability not found' });
      }

      res.json({
        id: req.params.id,
        availabilityDate,
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
      const availabilityId = parseInt(req.params.id);
      const userId = req.headers['x-user-id'] ? parseInt(req.headers['x-user-id']) : null;
      const userName = req.headers['x-user-name'] || 'System';

      // Get availability details before delete
      const [availabilities] = await pool.execute(
        `SELECT a.*, e.name as expert_name 
         FROM availability a 
         JOIN experts e ON a.expert_id = e.id 
         WHERE a.id = ?`,
        [availabilityId]
      );

      if (availabilities.length === 0) {
        return res.status(404).json({ error: 'Availability not found' });
      }

      const availability = availabilities[0];

      const [result] = await pool.execute(
        'DELETE FROM availability WHERE id = ?',
        [availabilityId]
      );

      if (result.affectedRows === 0) {
        return res.status(404).json({ error: 'Availability not found' });
      }

      // Log activity
      try {
        await pool.execute(
          `INSERT INTO activity_logs (user_id, user_name, action, entity_type, entity_id, details, ip_address, user_agent)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            userId,
            userName,
            'remove_availability',
            'availability',
            availabilityId,
            JSON.stringify({
              availability_id: availabilityId,
              expert_id: availability.expert_id,
              expert_name: availability.expert_name,
              availability_date: availability.availability_date,
              start_time: availability.start_time,
              end_time: availability.end_time
            }),
            req.ip || req.headers['x-forwarded-for'] || 'unknown',
            req.headers['user-agent'] || 'unknown'
          ]
        );
      } catch (logError) {
        console.error('Error logging activity:', logError);
        // Don't fail the request if logging fails
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
