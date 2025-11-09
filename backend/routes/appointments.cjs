const express = require('express');
const router = express.Router();

module.exports = (pool) => {
  // GET /api/appointments - Get appointments with optional filtering
  router.get('/', async (req, res) => {
    try {
      const { status, expertId, date, page = 1, limit = 20 } = req.query;
      const offset = (parseInt(page) - 1) * parseInt(limit);

      let query = `
        SELECT a.id, a.expert_id, a.user_name, a.appointment_date as date,
               a.appointment_time as time, a.status, a.notes,
               e.name as expert_name, a.created_at
        FROM appointments a
        JOIN experts e ON a.expert_id = e.id
        WHERE 1=1
      `;
      const params = [];

      if (status) {
        query += ' AND a.status = ?';
        params.push(status);
      }

      if (expertId) {
        query += ' AND a.expert_id = ?';
        params.push(expertId);
      }

      if (date) {
        query += ' AND DATE(a.appointment_date) = ?';
        params.push(date);
      }

      query += ' ORDER BY a.appointment_date DESC, a.appointment_time DESC';
      query += ' LIMIT ? OFFSET ?';
      params.push(parseInt(limit), offset);

      const [appointments] = await pool.execute(query, params);

      // Get total count for pagination
      let countQuery = 'SELECT COUNT(*) as total FROM appointments WHERE 1=1';
      const countParams = [];

      if (status) {
        countQuery += ' AND status = ?';
        countParams.push(status);
      }

      if (expertId) {
        countQuery += ' AND expert_id = ?';
        countParams.push(expertId);
      }

      if (date) {
        countQuery += ' AND DATE(appointment_date) = ?';
        countParams.push(date);
      }

      const [countResult] = await pool.execute(countQuery, countParams);
      const total = countResult[0].total;

      res.json({
        appointments,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit))
        }
      });
    } catch (error) {
      console.error('Error fetching appointments:', error);
      res.status(500).json({ error: 'Failed to fetch appointments' });
    }
  });

  // GET /api/appointments/:id - Get appointment by ID
  router.get('/:id', async (req, res) => {
    try {
      const [appointments] = await pool.execute(
        `SELECT a.id, a.expert_id, a.user_name, a.appointment_date as date,
                a.appointment_time as time, a.status, a.notes,
                e.name as expert_name, a.created_at
         FROM appointments a
         JOIN experts e ON a.expert_id = e.id
         WHERE a.id = ?`,
        [req.params.id]
      );

      if (appointments.length === 0) {
        return res.status(404).json({ error: 'Appointment not found' });
      }

      res.json(appointments[0]);
    } catch (error) {
      console.error('Error fetching appointment:', error);
      res.status(500).json({ error: 'Failed to fetch appointment' });
    }
  });

  // POST /api/appointments - Create new appointment
  router.post('/', async (req, res) => {
    try {
      const { expertId, userName, selectedDate, selectedTime, notes } = req.body;

      // Validate input
      if (!expertId || !userName || !selectedDate || !selectedTime) {
        return res.status(400).json({ error: 'Expert ID, user name, date, and time are required' });
      }

      // Check if expert exists
      const [experts] = await pool.execute(
        'SELECT id FROM experts WHERE id = ?',
        [expertId]
      );

      if (experts.length === 0) {
        return res.status(404).json({ error: 'Expert not found' });
      }

      // Check if time slot is available
      const [conflicts] = await pool.execute(
        `SELECT id FROM appointments
         WHERE expert_id = ? AND appointment_date = ? AND appointment_time = ?
         AND status != 'cancelled'`,
        [expertId, selectedDate, selectedTime]
      );

      if (conflicts.length > 0) {
        return res.status(409).json({ error: 'Time slot is already booked' });
      }

      const [result] = await pool.execute(
        `INSERT INTO appointments (expert_id, user_name, appointment_date, appointment_time, status, notes)
         VALUES (?, ?, ?, ?, 'pending', ?)`,
        [expertId, userName, selectedDate, selectedTime, notes || null]
      );

      res.status(201).json({
        id: result.insertId,
        expertId,
        userName,
        date: selectedDate,
        time: selectedTime,
        status: 'pending',
        notes: notes || null,
        created_at: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error creating appointment:', error);
      res.status(500).json({ error: 'Failed to create appointment' });
    }
  });

  // PUT /api/appointments/:id/approve - Approve appointment
  router.put('/:id/approve', async (req, res) => {
    try {
      const [result] = await pool.execute(
        'UPDATE appointments SET status = ? WHERE id = ?',
        ['approved', req.params.id]
      );

      if (result.affectedRows === 0) {
        return res.status(404).json({ error: 'Appointment not found' });
      }

      res.json({ message: 'Appointment approved successfully', status: 'approved' });
    } catch (error) {
      console.error('Error approving appointment:', error);
      res.status(500).json({ error: 'Failed to approve appointment' });
    }
  });

  // PUT /api/appointments/:id/cancel - Cancel/reject appointment
  router.put('/:id/cancel', async (req, res) => {
    try {
      const [result] = await pool.execute(
        'UPDATE appointments SET status = ? WHERE id = ?',
        ['cancelled', req.params.id]
      );

      if (result.affectedRows === 0) {
        return res.status(404).json({ error: 'Appointment not found' });
      }

      res.json({ message: 'Appointment cancelled successfully', status: 'cancelled' });
    } catch (error) {
      console.error('Error cancelling appointment:', error);
      res.status(500).json({ error: 'Failed to cancel appointment' });
    }
  });

  // DELETE /api/appointments/:id - Delete appointment
  router.delete('/:id', async (req, res) => {
    try {
      const [result] = await pool.execute(
        'DELETE FROM appointments WHERE id = ?',
        [req.params.id]
      );

      if (result.affectedRows === 0) {
        return res.status(404).json({ error: 'Appointment not found' });
      }

      res.json({ message: 'Appointment deleted successfully' });
    } catch (error) {
      console.error('Error deleting appointment:', error);
      res.status(500).json({ error: 'Failed to delete appointment' });
    }
  });

  return router;
};
