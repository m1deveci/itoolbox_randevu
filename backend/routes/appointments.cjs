const express = require('express');
const router = express.Router();
const {
  getSiteTitle,
  sendAppointmentNotificationToExpert,
  sendAppointmentApprovalToUser,
  sendAppointmentApprovalToExpert,
  sendAppointmentCancellationToUser,
  sendReassignmentNotificationToOldExpert,
  sendReassignmentNotificationToNewExpert,
  sendReassignmentNotificationToUser
} = require('../utils/emailHelper.cjs');

// Helper function to get reassignment reason from request body
function getReassignmentReason(req) {
  return req.body?.reassignmentReason || null;
}

module.exports = (pool) => {
  // GET /api/appointments - Get appointments with optional filtering
  router.get('/', async (req, res) => {
    try {
      const { status, expertId, date, page = 1, limit = 20 } = req.query;
      const offset = (parseInt(page) - 1) * parseInt(limit);

      let query = `
        SELECT a.id, a.expert_id, a.user_name, a.user_email, a.user_phone, a.ticket_no, DATE_FORMAT(a.appointment_date, '%Y-%m-%d') as date,
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

  // GET /api/appointments/check-duplicate - Check if pending appointment exists with same email and phone
  router.get('/check-duplicate', async (req, res) => {
    try {
      const { email, phone } = req.query;

      if (!email || !phone) {
        return res.status(400).json({ error: 'Email and phone are required' });
      }

      // Remove any non-digit characters from phone for comparison
      const phoneDigits = phone.replace(/\D/g, '');

      const [appointments] = await pool.execute(
        `SELECT id, status FROM appointments
         WHERE user_email = ? AND user_phone = ? AND status = 'pending'`,
        [email, phoneDigits]
      );

      if (appointments.length > 0) {
        return res.json({
          hasPendingAppointment: true,
          message: 'Bu e-posta ve telefon numarası ile zaten bekleme durumunda bir randevu bulunmaktadır.'
        });
      }

      res.json({ hasPendingAppointment: false });
    } catch (error) {
      console.error('Error checking duplicate appointment:', error);
      res.status(500).json({ error: 'Failed to check appointment' });
    }
  });

  // GET /api/appointments/by-email/:email - Get appointments by email
  router.get('/by-email/:email', async (req, res) => {
    try {
      const { email } = req.params;

      const query = `
        SELECT a.id, a.expert_id, a.user_name, a.user_email, a.user_phone, a.ticket_no, DATE_FORMAT(a.appointment_date, '%Y-%m-%d') as date,
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
        `SELECT a.id, a.expert_id, a.user_name, a.user_email, a.user_phone, a.ticket_no, DATE_FORMAT(a.appointment_date, '%Y-%m-%d') as date,
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

      // Validate ticket number format (INC0/RITM + 7 digits OR REQ + 6+ digits)
      const isValidTicket = /^(INC0\d{6}|RITM\d{7}|REQ\d{6,})$/.test(ticketNo);
      if (!isValidTicket) {
        return res.status(400).json({ error: 'Ticket number must be in format INC0XXXXXX, RITMXXXXXXX or REQXXXXXX' });
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

      // Check if expert has availability for this date
      // Get expert's availabilities for this specific date
      const [availabilities] = await pool.execute(
        `SELECT start_time, end_time FROM availability
         WHERE expert_id = ? AND availability_date = ?`,
        [expertId, appointmentDate]
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

      // Fetch site title for emails
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

      // Send email notification to user (async, don't wait for it)
      sendAppointmentApprovalToUser(pool, siteTitle, appointment, {
        name: appointment.expert_name,
        email: appointment.expert_email || ''
      }).catch(error => {
        console.error('Error sending approval email to user:', error);
      });

      // Send email notification to expert (async, don't wait for it)
      sendAppointmentApprovalToExpert(pool, siteTitle, appointment, {
        name: appointment.expert_name,
        email: appointment.expert_email || ''
      }).catch(error => {
        console.error('Error sending approval email to expert:', error);
      });

      res.json({ message: 'Appointment approved successfully', status: 'approved' });
    } catch (error) {
      console.error('Error approving appointment:', error);
      res.status(500).json({ error: 'Failed to approve appointment' });
    }
  });

  // PUT /api/appointments/:id/reassign-expert - Reassign appointment to a different expert
  router.put('/:id/reassign-expert', async (req, res) => {
    try {
      const appointmentId = parseInt(req.params.id);
      const { newExpertId } = req.body;
      const userId = req.headers['x-user-id'] ? parseInt(req.headers['x-user-id']) : null;
      const userName = req.headers['x-user-name'] || 'System';

      if (!newExpertId) {
        return res.status(400).json({ error: 'New expert ID is required' });
      }

      // Get appointment details
      const [appointments] = await pool.execute(
        `SELECT a.*, e.name as old_expert_name, e.email as old_expert_email
         FROM appointments a
         JOIN experts e ON a.expert_id = e.id
         WHERE a.id = ?`,
        [appointmentId]
      );

      if (appointments.length === 0) {
        return res.status(404).json({ error: 'Appointment not found' });
      }

      const appointment = appointments[0];

      // Check if appointment is pending
      if (appointment.status !== 'pending') {
        return res.status(400).json({ error: 'Only pending appointments can be reassigned' });
      }

      // Check if old and new expert are different
      if (appointment.expert_id === parseInt(newExpertId)) {
        return res.status(400).json({ error: 'New expert must be different from current expert' });
      }

      // Check if new expert exists
      const [newExperts] = await pool.execute(
        'SELECT id, name, email FROM experts WHERE id = ?',
        [newExpertId]
      );

      if (newExperts.length === 0) {
        return res.status(404).json({ error: 'New expert not found' });
      }

      const newExpert = newExperts[0];

      // Check if new expert has availability for this date and time
      const [availabilities] = await pool.execute(
        `SELECT start_time FROM availability
         WHERE expert_id = ? AND availability_date = ?`,
        [newExpertId, appointment.appointment_date]
      );

      if (availabilities.length === 0) {
        return res.status(400).json({ error: 'New expert has no availability for this date' });
      }

      // Check if requested time matches exactly with any availability startTime
      const requestedTimeStr = appointment.appointment_time.substring(0, 5);
      const isTimeAvailable = availabilities.some((avail) => {
        const availStartTime = avail.start_time.substring(0, 5);
        return availStartTime === requestedTimeStr;
      });

      if (!isTimeAvailable) {
        return res.status(400).json({ error: 'New expert is not available at this time' });
      }

      // Check if time slot is already booked for new expert
      const [conflicts] = await pool.execute(
        `SELECT id FROM appointments
         WHERE expert_id = ? AND appointment_date = ? AND appointment_time = ?
         AND status != 'cancelled'`,
        [newExpertId, appointment.appointment_date, appointment.appointment_time]
      );

      if (conflicts.length > 0) {
        return res.status(409).json({ error: 'Time slot is already booked for new expert' });
      }

      // Get reassignment reason from request
      const reassignmentReason = req.body?.reassignmentReason || null;

      // Update appointment with new expert and reassignment reason
      const [result] = await pool.execute(
        'UPDATE appointments SET expert_id = ?, reassignment_reason = ? WHERE id = ?',
        [newExpertId, reassignmentReason, appointmentId]
      );

      if (result.affectedRows === 0) {
        return res.status(404).json({ error: 'Failed to update appointment' });
      }

      // Update appointment object with reassignment reason for email notifications
      appointment.reassignment_reason = reassignmentReason;

      // Log activity
      try {
        await pool.execute(
          `INSERT INTO activity_logs (user_id, user_name, action, entity_type, entity_id, details, ip_address, user_agent)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            userId,
            userName,
            'reassign_appointment',
            'appointment',
            appointmentId,
            JSON.stringify({
              appointment_id: appointmentId,
              ticket_no: appointment.ticket_no,
              appointment_date: appointment.appointment_date,
              appointment_time: appointment.appointment_time,
              old_expert_id: appointment.expert_id,
              old_expert_name: appointment.old_expert_name,
              new_expert_id: newExpertId,
              new_expert_name: newExpert.name,
              user_name: appointment.user_name,
              user_email: appointment.user_email
            }),
            req.ip || req.headers['x-forwarded-for'] || 'unknown',
            req.headers['user-agent'] || 'unknown'
          ]
        );
      } catch (logError) {
        console.error('Error logging activity:', logError);
      }

      // Send email notifications (async, don't wait for them)
      const oldExpertData = { name: appointment.old_expert_name, email: appointment.old_expert_email || '' };

      sendReassignmentNotificationToOldExpert(pool, appointment, oldExpertData, newExpert).catch(error => {
        console.error('Error sending reassignment email to old expert:', error);
      });

      sendReassignmentNotificationToNewExpert(pool, appointment, newExpert, oldExpertData).catch(error => {
        console.error('Error sending reassignment email to new expert:', error);
      });

      sendReassignmentNotificationToUser(pool, appointment, oldExpertData, newExpert).catch(error => {
        console.error('Error sending reassignment email to user:', error);
      });

      res.json({
        message: 'Appointment reassigned successfully',
        newExpertId,
        newExpertName: newExpert.name
      });
    } catch (error) {
      console.error('Error reassigning appointment:', error);
      res.status(500).json({ error: 'Failed to reassign appointment' });
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
