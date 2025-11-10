const express = require('express');
const router = express.Router();
const {
  sendAppointmentNotificationToExpert,
  sendAppointmentApprovalToUser,
  sendAppointmentCancellationToUser
} = require('../utils/emailHelper.cjs');

module.exports = (pool) => {
  // GET /api/appointments - Get appointments with optional filtering
  router.get('/', async (req, res) => {
    try {
      const { status, expertId, date, page = 1, limit = 20 } = req.query;
      const offset = (parseInt(page) - 1) * parseInt(limit);

      let query = `
        SELECT a.id, a.expert_id, a.user_name, a.user_email, a.user_phone, a.ticket_no, a.appointment_date as date,
               a.appointment_time as time, a.status, a.notes, a.cancellation_reason,
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

  // ===== LOCK ROUTES (must be before parametrized routes) =====

  // GET /api/appointments/lock/check - Check if time slot is locked
  router.get('/lock/check', async (req, res) => {
    try {
      const { expertId, date, time, currentSessionId } = req.query;

      if (!expertId || !date || !time) {
        return res.status(400).json({ error: 'Expert ID, date, and time are required' });
      }

      // Clean up expired locks
      await pool.execute(
        'DELETE FROM appointment_locks WHERE expires_at < NOW()'
      );

      // Check for active locks (excluding current session)
      const [locks] = await pool.execute(
        `SELECT session_id FROM appointment_locks
         WHERE expert_id = ? AND appointment_date = ? AND appointment_time = ?
         AND session_id != ? AND expires_at > NOW()`,
        [expertId, date, time, currentSessionId || '']
      );

      if (locks.length > 0) {
        return res.status(409).json({
          error: 'Bu tarih ve saat başka bir kullanıcı tarafından seçilmiş. Lütfen başka bir saat seçiniz.',
          locked: true
        });
      }

      res.json({
        locked: false,
        message: 'Time slot is available'
      });
    } catch (error) {
      console.error('Error checking lock:', error);
      res.status(500).json({ error: 'Failed to check lock' });
    }
  });

  // POST /api/appointments/lock/create - Create a temporary lock for a time slot
  router.post('/lock/create', async (req, res) => {
    try {
      const { expertId, appointmentDate, appointmentTime, sessionId } = req.body;

      if (!expertId || !appointmentDate || !appointmentTime || !sessionId) {
        return res.status(400).json({ error: 'Expert ID, date, time, and session ID are required' });
      }

      // Calculate expiration time (90 seconds from now)
      const expiresAt = new Date(Date.now() + 90 * 1000);

      // Create or update the lock (if session already has a lock, update it)
      const [result] = await pool.execute(
        `INSERT INTO appointment_locks (expert_id, appointment_date, appointment_time, session_id, created_at, expires_at)
         VALUES (?, ?, ?, ?, NOW(), ?)
         ON DUPLICATE KEY UPDATE expires_at = VALUES(expires_at), created_at = NOW()`,
        [expertId, appointmentDate, appointmentTime, sessionId, expiresAt]
      );

      res.status(201).json({
        lockId: result.insertId,
        expiresAt: expiresAt.toISOString(),
        message: 'Time slot locked for 90 seconds'
      });
    } catch (error) {
      console.error('Error creating lock:', error);
      res.status(500).json({ error: 'Failed to create lock' });
    }
  });

  // DELETE /api/appointments/lock/release/:sessionId - Release lock
  router.delete('/lock/release/:sessionId', async (req, res) => {
    try {
      const { sessionId } = req.params;

      const [result] = await pool.execute(
        'DELETE FROM appointment_locks WHERE session_id = ?',
        [sessionId]
      );

      if (result.affectedRows === 0) {
        return res.status(404).json({ error: 'Lock not found' });
      }

      res.json({ message: 'Lock released successfully' });
    } catch (error) {
      console.error('Error releasing lock:', error);
      res.status(500).json({ error: 'Failed to release lock' });
    }
  });

  // ===== END LOCK ROUTES =====

  // GET /api/appointments/by-email/:email - Get appointments by email
  router.get('/by-email/:email', async (req, res) => {
    try {
      const { email } = req.params;

      const query = `
        SELECT a.id, a.expert_id, a.user_name, a.user_email, a.user_phone, a.ticket_no, a.appointment_date as date,
               a.appointment_time as time, a.status, a.notes, a.cancellation_reason,
               e.name as expert_name, a.created_at
        FROM appointments a
        JOIN experts e ON a.expert_id = e.id
        WHERE a.user_email = ?
        ORDER BY a.appointment_date DESC, a.appointment_time DESC
      `;

      const [appointments] = await pool.execute(query, [email]);

      res.json({ appointments });
    } catch (error) {
      console.error('Error fetching appointments by email:', error);
      res.status(500).json({ error: 'Failed to fetch appointments' });
    }
  });

  // GET /api/appointments/:id - Get appointment by ID
  router.get('/:id', async (req, res) => {
    try {
      const [appointments] = await pool.execute(
        `SELECT a.id, a.expert_id, a.user_name, a.user_email, a.user_phone, a.ticket_no, a.appointment_date as date,
                a.appointment_time as time, a.status, a.notes, a.cancellation_reason,
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
      const { expertId, userName, userEmail, userPhone, ticketNo, appointmentDate, appointmentTime, notes } = req.body;

      // Validate input
      if (!expertId || !userName || !userEmail || !userPhone || !ticketNo || !appointmentDate || !appointmentTime) {
        return res.status(400).json({ error: 'Expert ID, user name, email, phone, ticket number, date, and time are required' });
      }

      // Validate ticket number format (INC0 + 6 digits = 10 characters total)
      if (!/^INC0\d{6}$/.test(ticketNo)) {
        return res.status(400).json({ error: 'Ticket number must be in format INC0XXXXXX (10 characters total)' });
      }

      // Check if expert exists and get expert details
      const [experts] = await pool.execute(
        'SELECT id, name, email FROM experts WHERE id = ?',
        [expertId]
      );

      if (experts.length === 0) {
        return res.status(404).json({ error: 'Expert not found' });
      }

      const expert = experts[0];

      // Check if expert has availability for this date and time
      const appointmentDateObj = new Date(appointmentDate + 'T00:00:00');
      const dayOfWeek = appointmentDateObj.getDay(); // 0=Sunday, 1=Monday, etc.
      // Convert to our day format (Monday=0, Sunday=6)
      const dayOfWeekFormatted = dayOfWeek === 0 ? 6 : dayOfWeek - 1;

      // Get expert's availabilities for this day of week
      const [availabilities] = await pool.execute(
        `SELECT start_time, end_time FROM availability
         WHERE expert_id = ? AND day_of_week = ?`,
        [expertId, dayOfWeekFormatted]
      );

      if (availabilities.length === 0) {
        return res.status(400).json({ error: 'Expert has no availability for this day' });
      }

      // Check if the requested time matches exactly with any availability startTime
      const requestedTimeStr = appointmentTime.substring(0, 5); // "HH:MM"
      const isTimeAvailable = availabilities.some((avail) => {
        const availStartTime = avail.start_time.substring(0, 5); // "HH:MM"
        // Check if requested time exactly matches availability startTime
        return availStartTime === requestedTimeStr;
      });

      if (!isTimeAvailable) {
        return res.status(400).json({ error: 'Selected time is not available for this expert' });
      }

      // Check if time slot is already booked
      const [conflicts] = await pool.execute(
        `SELECT id FROM appointments
         WHERE expert_id = ? AND appointment_date = ? AND appointment_time = ?
         AND status != 'cancelled'`,
        [expertId, appointmentDate, appointmentTime]
      );

      if (conflicts.length > 0) {
        return res.status(409).json({ error: 'Time slot is already booked' });
      }

      // Check if user with same email and phone already has an active appointment
      const [duplicateAppointments] = await pool.execute(
        `SELECT id, expert_id, appointment_date, appointment_time, status
         FROM appointments
         WHERE user_email = ? AND user_phone = ? AND status != 'cancelled'`,
        [userEmail, userPhone]
      );

      if (duplicateAppointments.length > 0) {
        return res.status(409).json({
          error: 'Bu e-posta ve telefon numarası ile zaten aktif bir randevunuz bulunmaktadır. Lütfen mevcut randevunuzu iptal ettikten sonra yeni bir randevu oluşturunuz.'
        });
      }

      // Get minimum booking hours from settings (default: 3 hours)
      const [minHoursSettings] = await pool.execute(
        'SELECT value FROM settings WHERE key_name = "minimum_booking_hours"'
      );
      const minimumBookingHours = parseInt(minHoursSettings[0]?.value || '3');

      // Check if appointment is at least minimum_booking_hours from now
      const now = new Date();
      const appointmentDateTime = new Date(appointmentDate + 'T' + appointmentTime);
      const hoursUntilAppointment = (appointmentDateTime - now) / (1000 * 60 * 60);

      if (hoursUntilAppointment < minimumBookingHours) {
        return res.status(400).json({
          error: `Randevu saatinden en az ${minimumBookingHours} saat önce randevu almalısınız.`
        });
      }

      const [result] = await pool.execute(
        `INSERT INTO appointments (expert_id, user_name, user_email, user_phone, ticket_no, appointment_date, appointment_time, status, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
        [expertId, userName, userEmail, userPhone, ticketNo, appointmentDate, appointmentTime, notes || null]
      );

      const appointment = {
        id: result.insertId,
        expert_id: expertId,
        user_name: userName,
        user_email: userEmail,
        user_phone: userPhone,
        ticket_no: ticketNo,
        appointment_date: appointmentDate,
        appointment_time: appointmentTime,
        notes: notes || null
      };

      // Send email notification to expert (async, don't wait for it)
      sendAppointmentNotificationToExpert(pool, appointment, expert).catch(error => {
        console.error('Error sending email notification to expert:', error);
      });

      res.status(201).json({
        id: result.insertId,
        expertId,
        userName,
        userEmail,
        userPhone,
        date: appointmentDate,
        time: appointmentTime,
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
      const appointmentId = parseInt(req.params.id);
      const userId = req.headers['x-user-id'] ? parseInt(req.headers['x-user-id']) : null;
      const userName = req.headers['x-user-name'] || 'System';
      
      // Get appointment details before update
      const [appointments] = await pool.execute(
        `SELECT a.*, e.name as expert_name, e.email as expert_email
         FROM appointments a 
         JOIN experts e ON a.expert_id = e.id 
         WHERE a.id = ?`,
        [appointmentId]
      );

      if (appointments.length === 0) {
        return res.status(404).json({ error: 'Appointment not found' });
      }

      const appointment = appointments[0];

      const [result] = await pool.execute(
        'UPDATE appointments SET status = ? WHERE id = ?',
        ['approved', appointmentId]
      );

      if (result.affectedRows === 0) {
        return res.status(404).json({ error: 'Appointment not found' });
      }

      // Log activity
      try {
        await pool.execute(
          `INSERT INTO activity_logs (user_id, user_name, action, entity_type, entity_id, details, ip_address, user_agent)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            userId,
            userName,
            'approve_appointment',
            'appointment',
            appointmentId,
            JSON.stringify({
              appointment_id: appointmentId,
              expert_id: appointment.expert_id,
              expert_name: appointment.expert_name,
              user_name: appointment.user_name,
              user_email: appointment.user_email,
              appointment_date: appointment.appointment_date,
              appointment_time: appointment.appointment_time,
              ticket_no: appointment.ticket_no
            }),
            req.ip || req.headers['x-forwarded-for'] || 'unknown',
            req.headers['user-agent'] || 'unknown'
          ]
        );
      } catch (logError) {
        console.error('Error logging activity:', logError);
        // Don't fail the request if logging fails
      }

      // Send email notification to user (async, don't wait for it)
      sendAppointmentApprovalToUser(pool, appointment, { 
        name: appointment.expert_name, 
        email: appointment.expert_email || '' 
      }).catch(error => {
        console.error('Error sending approval email to user:', error);
      });

      res.json({ message: 'Appointment approved successfully', status: 'approved' });
    } catch (error) {
      console.error('Error approving appointment:', error);
      res.status(500).json({ error: 'Failed to approve appointment' });
    }
  });

  // PUT /api/appointments/:id/cancel - Cancel/reject appointment
  router.put('/:id/cancel', async (req, res) => {
    try {
      const appointmentId = parseInt(req.params.id);
      const { cancellationReason } = req.body;
      const userId = req.headers['x-user-id'] ? parseInt(req.headers['x-user-id']) : null;
      const userName = req.headers['x-user-name'] || 'System';

      // Get appointment details before update
      const [appointments] = await pool.execute(
        `SELECT a.*, e.name as expert_name, e.email as expert_email
         FROM appointments a 
         JOIN experts e ON a.expert_id = e.id 
         WHERE a.id = ?`,
        [appointmentId]
      );

      if (appointments.length === 0) {
        return res.status(404).json({ error: 'Appointment not found' });
      }

      const appointment = appointments[0];

      const [result] = await pool.execute(
        'UPDATE appointments SET status = ?, cancellation_reason = ? WHERE id = ?',
        ['cancelled', cancellationReason || null, appointmentId]
      );

      if (result.affectedRows === 0) {
        return res.status(404).json({ error: 'Appointment not found' });
      }

      // Log activity
      try {
        await pool.execute(
          `INSERT INTO activity_logs (user_id, user_name, action, entity_type, entity_id, details, ip_address, user_agent)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            userId,
            userName,
            'cancel_appointment',
            'appointment',
            appointmentId,
            JSON.stringify({
              appointment_id: appointmentId,
              expert_id: appointment.expert_id,
              expert_name: appointment.expert_name,
              user_name: appointment.user_name,
              user_email: appointment.user_email,
              appointment_date: appointment.appointment_date,
              appointment_time: appointment.appointment_time,
              ticket_no: appointment.ticket_no,
              cancellation_reason: cancellationReason || null
            }),
            req.ip || req.headers['x-forwarded-for'] || 'unknown',
            req.headers['user-agent'] || 'unknown'
          ]
        );
      } catch (logError) {
        console.error('Error logging activity:', logError);
        // Don't fail the request if logging fails
      }

      // Send email notification to user (async, don't wait for it)
      sendAppointmentCancellationToUser(pool, appointment, { name: appointment.expert_name, email: appointment.expert_email || '' }, cancellationReason).catch(error => {
        console.error('Error sending cancellation email to user:', error);
      });

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
