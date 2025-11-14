const express = require('express');
const router = express.Router();
const mysql = require('mysql2/promise');
const {
  getSiteTitle,
  sendAppointmentNotificationToExpert,
  sendAppointmentApprovalToUser,
  sendAppointmentApprovalToExpert,
  sendAppointmentCancellationToUser,
  sendReassignmentNotificationToOldExpert,
  sendReassignmentNotificationToNewExpert,
  sendReassignmentNotificationToUser,
  sendAppointmentCompletionToUser,
  sendAppointmentReminderToUser
} = require('../utils/emailHelper.cjs');

// Create connection pool for ittoolbox database
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
               TIME_FORMAT(a.appointment_time, '%H:%i') as time,
               a.status,
               a.notes, a.cancellation_reason,
               COALESCE(e.name, 'Bilinmeyen Uzman') as expert_name, a.created_at
        FROM appointments a
        LEFT JOIN experts e ON a.expert_id = e.id
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
        // If filtering by date, don't apply pagination limit (we need all appointments for that date)
        // This ensures all appointments for a specific date are returned for availability checking
        query += ' ORDER BY a.appointment_time ASC';
      } else {
        // Only apply pagination if not filtering by specific date
        query += ' ORDER BY a.appointment_date DESC, a.appointment_time DESC';
        query += ' LIMIT ? OFFSET ?';
        params.push(parseInt(limit), offset);
      }

      const [appointments] = await pool.execute(query, params);
      
      // Debug logging
      console.log('Appointments query:', query.substring(0, 200));
      console.log('Query params:', params);
      console.log('Found appointments:', appointments.length);

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
               TIME_FORMAT(a.appointment_time, '%H:%i') as time,
               a.status,
               a.notes, a.cancellation_reason,
               COALESCE(e.name, 'Bilinmeyen Uzman') as expert_name, a.created_at
        FROM appointments a
        LEFT JOIN experts e ON a.expert_id = e.id
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

  // GET /api/appointments/:id/phone-info - Get phone information for appointment user
  // This route must be before /:id route to avoid route conflicts
  router.get('/:id/phone-info', async (req, res) => {
    try {
      console.log('Phone-info route hit:', req.params.id, req.url);
      const appointmentId = req.params.id;
      
      // Validate appointment ID is numeric
      if (!appointmentId || isNaN(parseInt(appointmentId))) {
        return res.status(400).json({ error: 'Geçersiz randevu ID' });
      }

      // Get appointment details from randevu database
      const [appointments] = await pool.execute(
        'SELECT user_email FROM appointments WHERE id = ?',
        [appointmentId]
      );

      if (appointments.length === 0) {
        return res.status(404).json({ error: 'Randevu bulunamadı' });
      }

      const userEmail = appointments[0].user_email;

      if (!userEmail) {
        return res.json({ phones: [], message: 'Randevuya ait e-posta adresi bulunamadı' });
      }

      // Get user ID from ittoolbox users table by email
      const [users] = await ittoolboxPool.execute(
        'SELECT id FROM users WHERE email = ?',
        [userEmail]
      );

      if (users.length === 0) {
        return res.json({ phones: [], message: 'E-posta adresine ait kullanıcı bulunamadı' });
      }

      const userId = users[0].id;

      // Get mobile phones assigned to this user
      const [mobilePhones] = await ittoolboxPool.execute(
        `SELECT inventory_number, brand, model, imei1 
         FROM mobile_phones 
         WHERE assigned_user_id = ?`,
        [userId]
      );

      res.json({
        phones: mobilePhones,
        userEmail: userEmail,
        userId: userId
      });
    } catch (error) {
      console.error('Error fetching phone info:', error);
      res.status(500).json({ error: 'Telefon bilgileri alınırken hata oluştu', details: error.message });
    }
  });

  // GET /api/appointments/:id - Get appointment by ID
  // This route must be after /:id/phone-info to avoid route conflicts
  router.get('/:id', async (req, res) => {
    try {
      const [appointments] = await pool.execute(
        `SELECT a.id, a.expert_id, a.user_name, a.user_email, a.user_phone, a.ticket_no, DATE_FORMAT(a.appointment_date, '%Y-%m-%d') as date,
                TIME_FORMAT(a.appointment_time, '%H:%i') as time,
                a.status,
                a.notes, a.cancellation_reason,
                COALESCE(e.name, 'Bilinmeyen Uzman') as expert_name, a.created_at
         FROM appointments a
         LEFT JOIN experts e ON a.expert_id = e.id
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
      // Also check next day due to timezone offset (AvailabilityManager stores with +1 day offset)
      // Use DATE() function to ensure proper date comparison and TIME_FORMAT for time
      
      // Calculate next date (1 day after) to handle timezone offset
      const appointmentDateObj = new Date(appointmentDate + 'T00:00:00');
      appointmentDateObj.setDate(appointmentDateObj.getDate() + 1);
      const nextYear = appointmentDateObj.getFullYear();
      const nextMonth = String(appointmentDateObj.getMonth() + 1).padStart(2, '0');
      const nextDay = String(appointmentDateObj.getDate()).padStart(2, '0');
      const nextDate = `${nextYear}-${nextMonth}-${nextDay}`;
      
      const [availabilities] = await pool.execute(
        `SELECT TIME_FORMAT(start_time, '%H:%i') as start_time, TIME_FORMAT(end_time, '%H:%i') as end_time 
         FROM availability
         WHERE expert_id = ? AND (DATE(availability_date) = ? OR DATE(availability_date) = ?)`,
        [expertId, appointmentDate, nextDate]
      );

      if (availabilities.length === 0) {
        return res.status(400).json({ error: 'Expert has no availability for this day' });
      }

      // Check if the requested time matches exactly with any availability startTime
      const requestedTimeStr = appointmentTime.substring(0, 5); // "HH:MM"
      const isTimeAvailable = availabilities.some((avail) => {
        const availStartTime = avail.start_time; // Already formatted as "HH:MM" from TIME_FORMAT
        // Check if requested time exactly matches availability startTime
        return availStartTime === requestedTimeStr;
      });

      if (!isTimeAvailable) {
        // Debug logging
        console.log('Availability check failed:', {
          expertId,
          appointmentDate,
          requestedTime: requestedTimeStr,
          availableTimes: availabilities.map(a => a.start_time)
        });
        return res.status(400).json({ error: 'Selected time is not available for this expert' });
      }

      // Check if time slot is already booked
      // Use DATE() for date comparison and TIME_FORMAT for time comparison
      const requestedTimeStrForConflict = appointmentTime.substring(0, 5); // "HH:MM"
      const [conflicts] = await pool.execute(
        `SELECT id FROM appointments
         WHERE expert_id = ? AND DATE(appointment_date) = ? 
         AND TIME_FORMAT(appointment_time, '%H:%i') = ?
         AND status != 'cancelled'`,
        [expertId, appointmentDate, requestedTimeStrForConflict]
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
      const userName = req.headers['x-user-name'] 
        ? decodeURIComponent(req.headers['x-user-name']) 
        : 'System';

      // Get appointment details before update
      const [appointments] = await pool.execute(
        `SELECT a.id, a.expert_id, a.user_name, a.user_email, a.user_phone, a.ticket_no,
                DATE_FORMAT(a.appointment_date, '%Y-%m-%d') as appointment_date, a.appointment_time,
                a.status, a.notes, a.cancellation_reason, a.created_at, a.updated_at,
                COALESCE(e.name, 'Bilinmeyen Uzman') as expert_name, e.email as expert_email
         FROM appointments a
         LEFT JOIN experts e ON a.expert_id = e.id
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
      const userName = req.headers['x-user-name'] 
        ? decodeURIComponent(req.headers['x-user-name']) 
        : 'System';

      if (!newExpertId) {
        return res.status(400).json({ error: 'New expert ID is required' });
      }

      // Get appointment details
      const [appointments] = await pool.execute(
        `SELECT a.id, a.expert_id, a.user_name, a.user_email, a.user_phone, a.ticket_no,
                DATE_FORMAT(a.appointment_date, '%Y-%m-%d') as appointment_date, a.appointment_time,
                a.status, a.notes, a.cancellation_reason, a.created_at, a.updated_at,
                COALESCE(e.name, 'Bilinmeyen Uzman') as old_expert_name, e.email as old_expert_email
         FROM appointments a
         LEFT JOIN experts e ON a.expert_id = e.id
         WHERE a.id = ?`,
        [appointmentId]
      );

      if (appointments.length === 0) {
        return res.status(404).json({ error: 'Appointment not found' });
      }

      const appointment = appointments[0];

      // Allow reassignment for both pending and approved appointments
      if (appointment.status !== 'pending' && appointment.status !== 'approved') {
        return res.status(400).json({ error: 'Only pending or approved appointments can be reassigned' });
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
      // Use DATE() function to ensure proper date comparison and TIME_FORMAT for time
      const [availabilities] = await pool.execute(
        `SELECT TIME_FORMAT(start_time, '%H:%i') as start_time FROM availability
         WHERE expert_id = ? AND DATE(availability_date) = ?`,
        [newExpertId, appointment.appointment_date]
      );

      if (availabilities.length === 0) {
        return res.status(400).json({ error: 'New expert has no availability for this date' });
      }

      // Check if requested time matches exactly with any availability startTime
      const requestedTimeStr = appointment.appointment_time.substring(0, 5);
      const isTimeAvailable = availabilities.some((avail) => {
        const availStartTime = avail.start_time; // Already formatted as "HH:MM" from TIME_FORMAT
        return availStartTime === requestedTimeStr;
      });

      if (!isTimeAvailable) {
        return res.status(400).json({ error: 'New expert is not available at this time' });
      }

      // Check if time slot is already booked for new expert
      // Use DATE() for date comparison and TIME_FORMAT for time comparison
      const [conflicts] = await pool.execute(
        `SELECT id FROM appointments
         WHERE expert_id = ? AND DATE(appointment_date) = ? 
         AND TIME_FORMAT(appointment_time, '%H:%i') = ?
         AND status != 'cancelled'`,
        [newExpertId, appointment.appointment_date, requestedTimeStr]
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
      const userName = req.headers['x-user-name'] 
        ? decodeURIComponent(req.headers['x-user-name']) 
        : 'System';

      // Get appointment details before update
      const [appointments] = await pool.execute(
        `SELECT a.id, a.expert_id, a.user_name, a.user_email, a.user_phone, a.ticket_no,
                DATE_FORMAT(a.appointment_date, '%Y-%m-%d') as appointment_date, a.appointment_time,
                a.status, a.notes, a.cancellation_reason, a.created_at, a.updated_at,
                COALESCE(e.name, 'Bilinmeyen Uzman') as expert_name, e.email as expert_email
         FROM appointments a
         LEFT JOIN experts e ON a.expert_id = e.id
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

  // POST /api/appointments/:id/remind - Send reminder email
  router.post('/:id/remind', async (req, res) => {
    try {
      const appointmentId = parseInt(req.params.id);

      // Get appointment details
      const [appointments] = await pool.execute(
        `SELECT a.id, a.expert_id, a.user_name, a.user_email, a.user_phone, a.ticket_no,
                DATE_FORMAT(a.appointment_date, '%Y-%m-%d') as appointment_date, a.appointment_time,
                a.status, a.notes, a.cancellation_reason, a.created_at, a.updated_at,
                COALESCE(e.name, 'Bilinmeyen Uzman') as expert_name, e.email as expert_email
         FROM appointments a
         LEFT JOIN experts e ON a.expert_id = e.id
         WHERE a.id = ?`,
        [appointmentId]
      );

      if (appointments.length === 0) {
        return res.status(404).json({ error: 'Appointment not found' });
      }

      const appointment = appointments[0];

      // Send reminder email to user
      sendAppointmentReminderToUser(pool, appointment, { name: appointment.expert_name }).catch(error => {
        console.error('Error sending reminder email:', error);
      });

      res.json({ message: 'Reminder email sent successfully' });
    } catch (error) {
      console.error('Error sending reminder:', error);
      res.status(500).json({ error: 'Failed to send reminder' });
    }
  });

  // PUT /api/appointments/:id/change-status - Change appointment status (completed/cancelled)
  router.put('/:id/change-status', async (req, res) => {
    try {
      const appointmentId = parseInt(req.params.id);
      const { status: newStatus, cancellationReason } = req.body;
      const userId = req.headers['x-user-id'] ? parseInt(req.headers['x-user-id']) : null;
      const userName = req.headers['x-user-name'] 
        ? decodeURIComponent(req.headers['x-user-name']) 
        : 'System';

      if (!['completed', 'cancelled'].includes(newStatus)) {
        return res.status(400).json({ error: 'Invalid status. Must be completed or cancelled' });
      }

      // Get appointment details before update
      const [appointments] = await pool.execute(
        `SELECT a.id, a.expert_id, a.user_name, a.user_email, a.user_phone, a.ticket_no,
                DATE_FORMAT(a.appointment_date, '%Y-%m-%d') as appointment_date, a.appointment_time,
                a.status, a.notes, a.cancellation_reason, a.created_at, a.updated_at,
                COALESCE(e.name, 'Bilinmeyen Uzman') as expert_name, e.email as expert_email
         FROM appointments a
         LEFT JOIN experts e ON a.expert_id = e.id
         WHERE a.id = ?`,
        [appointmentId]
      );

      if (appointments.length === 0) {
        return res.status(404).json({ error: 'Appointment not found' });
      }

      const appointment = appointments[0];

      // Update appointment status
      const updateQuery = newStatus === 'cancelled'
        ? 'UPDATE appointments SET status = ?, cancellation_reason = ? WHERE id = ?'
        : 'UPDATE appointments SET status = ? WHERE id = ?';

      const updateParams = newStatus === 'cancelled'
        ? ['cancelled', cancellationReason || '', appointmentId]
        : ['completed', appointmentId];

      const [result] = await pool.execute(updateQuery, updateParams);

      if (result.affectedRows === 0) {
        return res.status(404).json({ error: 'Appointment not found' });
      }

      // If cancelled, send cancellation email and clear availability
      if (newStatus === 'cancelled') {
        // Send cancellation email to user
        sendAppointmentCancellationToUser(pool, appointment, { name: appointment.expert_name }, cancellationReason).catch(error => {
          console.error('Error sending cancellation email:', error);
        });

        // Clear the time slot from expert's availability
        // Use DATE() for date comparison and TIME_FORMAT for time comparison
        try {
          const appointmentTimeStr = appointment.appointment_time.substring(0, 5); // "HH:MM"
          await pool.execute(
            `DELETE FROM availability
             WHERE expert_id = ? AND DATE(availability_date) = ? 
             AND TIME_FORMAT(start_time, '%H:%i') = ?`,
            [appointment.expert_id, appointment.appointment_date, appointmentTimeStr]
          );
        } catch (error) {
          console.error('Error clearing availability:', error);
        }
      }

      // If completed, send completion email with survey link
      if (newStatus === 'completed') {
        sendAppointmentCompletionToUser(pool, appointment, { name: appointment.expert_name }).catch(error => {
          console.error('Error sending completion email:', error);
        });
      }

      // Log activity
      try {
        await pool.execute(
          `INSERT INTO activity_logs (user_id, user_name, action, entity_type, entity_id, details, ip_address, user_agent)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            userId,
            userName,
            `change_status_to_${newStatus}`,
            'appointment',
            appointmentId,
            JSON.stringify({
              appointment_id: appointmentId,
              old_status: appointment.status,
              new_status: newStatus,
              expert_id: appointment.expert_id,
              user_email: appointment.user_email,
              cancellation_reason: cancellationReason || null
            }),
            req.ip || req.headers['x-forwarded-for'] || 'unknown',
            req.headers['user-agent'] || 'unknown'
          ]
        );
      } catch (error) {
        console.error('Error logging activity:', error);
      }

      res.json({ message: `Appointment status changed to ${newStatus}` });
    } catch (error) {
      console.error('Error changing appointment status:', error);
      res.status(500).json({ error: 'Failed to change appointment status' });
    }
  });

  // PUT /api/appointments/:id/reschedule - Request appointment reschedule
  router.put('/:id/reschedule', async (req, res) => {
    try {
      const appointmentId = parseInt(req.params.id);
      const { newDate, newTime, reason } = req.body;
      const userId = req.headers['x-user-id'] ? parseInt(req.headers['x-user-id']) : null;
      const userName = req.headers['x-user-name'] 
        ? decodeURIComponent(req.headers['x-user-name']) 
        : 'System';

      if (!newDate || !newTime || !reason) {
        return res.status(400).json({ error: 'Yeni tarih, saat ve değişiklik sebebi gereklidir' });
      }

      // Get appointment details
      const [appointments] = await pool.execute(
        `SELECT a.id, a.expert_id, a.user_name, a.user_email, a.user_phone, a.ticket_no,
                DATE_FORMAT(a.appointment_date, '%Y-%m-%d') as appointment_date, a.appointment_time,
                a.status, a.notes, a.cancellation_reason, a.created_at, a.updated_at,
                COALESCE(e.name, 'Bilinmeyen Uzman') as expert_name, e.email as expert_email
         FROM appointments a
         LEFT JOIN experts e ON a.expert_id = e.id
         WHERE a.id = ?`,
        [appointmentId]
      );

      if (appointments.length === 0) {
        return res.status(404).json({ error: 'Randevu bulunamadı' });
      }

      const appointment = appointments[0];

      // Only allow reschedule for approved appointments
      if (appointment.status !== 'approved') {
        return res.status(400).json({ error: 'Sadece onaylanmış randevular için tarih değişikliği yapılabilir' });
      }

      // Check if expert has availability for new date and time
      const [availabilities] = await pool.execute(
        `SELECT TIME_FORMAT(start_time, '%H:%i') as start_time, TIME_FORMAT(end_time, '%H:%i') as end_time 
         FROM availability
         WHERE expert_id = ? AND (DATE(availability_date) = ? OR DATE(availability_date) = DATE(? + INTERVAL 1 DAY))`,
        [appointment.expert_id, newDate, newDate]
      );

      if (availabilities.length === 0) {
        return res.status(400).json({ error: 'IT Uzmanının bu tarih için müsaitliği bulunmamaktadır' });
      }

      const requestedTimeStr = newTime.substring(0, 5);
      const isTimeAvailable = availabilities.some((avail) => {
        return avail.start_time === requestedTimeStr;
      });

      if (!isTimeAvailable) {
        return res.status(400).json({ error: 'Seçilen saat için müsaitlik bulunmamaktadır' });
      }

      // Check if time slot is already booked
      // Only block "pending" and "approved" appointments (active appointments)
      // Don't block "completed" or "cancelled" appointments (past/inactive appointments)
      const [conflicts] = await pool.execute(
        `SELECT id FROM appointments
         WHERE expert_id = ? AND DATE(appointment_date) = ?
         AND TIME_FORMAT(appointment_time, '%H:%i') = ?
         AND (status = 'pending' OR status = 'approved') AND id != ?`,
        [appointment.expert_id, newDate, requestedTimeStr, appointmentId]
      );

      if (conflicts.length > 0) {
        return res.status(409).json({ error: 'Bu saat için başka bir aktif randevu bulunmaktadır' });
      }

      // Store reschedule request in appointments table (add columns if needed)
      // Check if columns exist, if not add them
      try {
        const [columns] = await pool.execute(`
          SELECT COLUMN_NAME 
          FROM INFORMATION_SCHEMA.COLUMNS 
          WHERE TABLE_SCHEMA = DATABASE() 
          AND TABLE_NAME = 'appointments' 
          AND COLUMN_NAME = 'reschedule_token'
        `);
        
        if (columns.length === 0) {
          // Columns don't exist, add them
          await pool.execute(`
            ALTER TABLE appointments 
            ADD COLUMN reschedule_token VARCHAR(64) NULL,
            ADD COLUMN reschedule_new_date DATE NULL,
            ADD COLUMN reschedule_new_time TIME NULL,
            ADD COLUMN reschedule_reason TEXT NULL,
            ADD COLUMN reschedule_status ENUM('pending', 'approved', 'rejected') NULL
          `);
        }
      } catch (alterError) {
        // Columns might already exist or other error, log and continue
        console.log('Note: Reschedule columns check/creation:', alterError.message);
      }

      // Generate unique token for reschedule request (AFTER ensuring columns exist)
      const crypto = require('crypto');
      let rescheduleToken;
      let tokenGenerated = false;
      let attempts = 0;
      const maxAttempts = 5;

      // Ensure token is generated successfully
      while (!tokenGenerated && attempts < maxAttempts) {
        try {
          rescheduleToken = crypto.randomBytes(32).toString('hex');
          if (rescheduleToken && rescheduleToken.length === 64) {
            tokenGenerated = true;
            console.log('Token generated successfully:', {
              appointmentId,
              token: rescheduleToken,
              tokenLength: rescheduleToken.length,
              attempt: attempts + 1
            });
          } else {
            attempts++;
            console.warn('Token generation failed, retrying...', {
              appointmentId,
              attempt: attempts,
              tokenLength: rescheduleToken ? rescheduleToken.length : 0
            });
          }
        } catch (tokenError) {
          attempts++;
          console.error('Error generating token:', tokenError);
          if (attempts >= maxAttempts) {
            return res.status(500).json({ error: 'Token oluşturulamadı. Lütfen tekrar deneyin.' });
          }
        }
      }

      if (!tokenGenerated || !rescheduleToken) {
        console.error('Failed to generate token after max attempts', { appointmentId, attempts });
        return res.status(500).json({ error: 'Token oluşturulamadı. Lütfen tekrar deneyin.' });
      }

      // Update appointment with reschedule request
      // Use a transaction to ensure atomicity
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();

        // First, check current appointment state
        const [beforeUpdate] = await connection.execute(
          `SELECT id, status, reschedule_token, reschedule_status FROM appointments WHERE id = ?`,
          [appointmentId]
        );
        console.log('Before update - appointment state:', {
          appointmentId,
          status: beforeUpdate[0]?.status,
          currentToken: beforeUpdate[0]?.reschedule_token,
          currentRescheduleStatus: beforeUpdate[0]?.reschedule_status
        });

        // Verify token is valid before update
        if (!rescheduleToken || rescheduleToken.length !== 64) {
          await connection.rollback();
          console.error('Invalid token before update:', {
            appointmentId,
            token: rescheduleToken,
            tokenLength: rescheduleToken ? rescheduleToken.length : 0
          });
          return res.status(500).json({ error: 'Geçersiz token. Lütfen tekrar deneyin.' });
        }

        console.log('Attempting to update with token:', {
          appointmentId,
          token: rescheduleToken,
          tokenLength: rescheduleToken.length,
          newDate,
          newTime,
          reason: reason.substring(0, 50) + '...'
        });

        // First, check if there's an existing reschedule request and clear it
        const [existingCheck] = await connection.execute(
          `SELECT reschedule_token, reschedule_status FROM appointments WHERE id = ?`,
          [appointmentId]
        );
        
        if (existingCheck.length > 0 && existingCheck[0].reschedule_token) {
          console.log('Existing reschedule token found, will be replaced:', {
            appointmentId,
            oldToken: existingCheck[0].reschedule_token,
            oldStatus: existingCheck[0].reschedule_status
          });
        }

        // Update appointment with reschedule request
        // We already checked that status is 'approved' above, so we can safely update
        // Remove WHERE condition restrictions to ensure update happens
        const [updateResult] = await connection.execute(
          `UPDATE appointments 
           SET reschedule_token = ?, reschedule_new_date = ?, reschedule_new_time = ?, 
               reschedule_reason = ?, reschedule_status = 'pending'
           WHERE id = ?`,
          [rescheduleToken, newDate, newTime, reason, appointmentId]
        );

        console.log('Token update result:', {
          appointmentId,
          affectedRows: updateResult.affectedRows,
          changedRows: updateResult.changedRows,
          token: rescheduleToken,
          tokenLength: rescheduleToken.length,
          warningCount: updateResult.warningCount || 0
        });

        if (updateResult.affectedRows === 0) {
          await connection.rollback();
          console.error('No rows affected when updating reschedule token!', {
            appointmentId,
            token: rescheduleToken,
            appointmentStatus: appointment.status
          });
          return res.status(404).json({ error: 'Randevu bulunamadı veya güncellenemedi' });
        }

        // Verify token was saved correctly BEFORE committing
        const [verifyToken] = await connection.execute(
          `SELECT reschedule_token, reschedule_status, status FROM appointments WHERE id = ?`,
          [appointmentId]
        );
        
        if (verifyToken.length === 0) {
          await connection.rollback();
          console.error('Appointment not found after update!', { appointmentId });
          return res.status(404).json({ error: 'Randevu bulunamadı' });
        }

        const savedToken = verifyToken[0]?.reschedule_token;
        console.log('Token saved and verified (before commit):', {
          appointmentId,
          originalToken: rescheduleToken,
          savedToken: savedToken,
          savedTokenLength: savedToken ? savedToken.length : 0,
          tokenLength: rescheduleToken.length,
          match: savedToken === rescheduleToken,
          status: verifyToken[0]?.reschedule_status,
          appointmentStatus: verifyToken[0]?.status,
          savedTokenType: typeof savedToken,
          originalTokenType: typeof rescheduleToken
        });

        // If token is NULL, rollback and return error - don't retry
        if (!savedToken || savedToken !== rescheduleToken) {
          await connection.rollback();
          console.error('Token not saved correctly after update!', {
            appointmentId,
            originalToken: rescheduleToken,
            savedToken: savedToken,
            originalLength: rescheduleToken.length,
            savedLength: savedToken ? savedToken.length : 0,
            affectedRows: updateResult.affectedRows
          });
          return res.status(500).json({ error: 'Token kaydedilemedi. Lütfen tekrar deneyin.' });
        }

        // Commit the transaction
        await connection.commit();
        console.log('Transaction committed successfully for reschedule request:', {
          appointmentId,
          token: rescheduleToken
        });

        // Verify token AFTER commit to ensure it's persisted
        const [finalCheck] = await pool.execute(
          `SELECT reschedule_token, reschedule_status, status FROM appointments WHERE id = ?`,
          [appointmentId]
        );
        
        if (finalCheck.length > 0) {
          const finalToken = finalCheck[0]?.reschedule_token;
          console.log('Final token verification (after commit):', {
            appointmentId,
            originalToken: rescheduleToken,
            finalToken: finalToken,
            finalTokenLength: finalToken ? finalToken.length : 0,
            match: finalToken === rescheduleToken,
            status: finalCheck[0]?.reschedule_status
          });

          if (!finalToken || finalToken !== rescheduleToken) {
            console.error('CRITICAL: Token lost after commit!', {
              appointmentId,
              originalToken: rescheduleToken,
              finalToken: finalToken
            });
            // Don't fail here, but log the issue
          }
        }
      } catch (transactionError) {
        await connection.rollback();
        console.error('Transaction error when saving reschedule token:', transactionError);
        throw transactionError;
      } finally {
        connection.release();
      }

      // Send email to user with approve/reject links
      const { sendRescheduleRequestEmail } = require('../utils/emailHelper.cjs');
      await sendRescheduleRequestEmail(pool, appointment, {
        name: appointment.expert_name,
        email: appointment.expert_email
      }, newDate, newTime, reason, rescheduleToken).catch(error => {
        console.error('Error sending reschedule request email:', error);
      });

      // Create notification for reschedule request
      try {
        await pool.execute(
          `INSERT INTO notifications (user_email, appointment_id, type, title, message, data)
           VALUES (?, ?, 'reschedule_requested', ?, ?, ?)`,
          [
            appointment.user_email,
            appointmentId,
            'Randevu Tarih Değişikliği Talebi',
            `${appointment.expert_name} adlı IT Uzmanı, randevu tarihinizi değiştirmek istiyor. ${newDate} ${newTime}'de yeni tarih önerilmektedir.`,
            JSON.stringify({
              appointment_id: appointmentId,
              old_date: appointment.appointment_date,
              old_time: appointment.appointment_time,
              new_date: newDate,
              new_time: newTime,
              reason: reason,
              expert_name: appointment.expert_name
            })
          ]
        );
      } catch (notifError) {
        console.error('Error creating reschedule request notification:', notifError);
        // Continue even if notification creation fails
      }

      // Log activity
      try {
        await pool.execute(
          `INSERT INTO activity_logs (user_id, user_name, action, entity_type, entity_id, details, ip_address, user_agent)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            userId,
            userName,
            'request_reschedule',
            'appointment',
            appointmentId,
            JSON.stringify({
              appointment_id: appointmentId,
              old_date: appointment.appointment_date,
              old_time: appointment.appointment_time,
              new_date: newDate,
              new_time: newTime,
              reason: reason
            }),
            req.ip || req.headers['x-forwarded-for'] || 'unknown',
            req.headers['user-agent'] || 'unknown'
          ]
        );
      } catch (error) {
        console.error('Error logging activity:', error);
      }

      res.json({ 
        message: 'Tarih değişikliği talebi gönderildi. Kullanıcıya e-posta ile bildirim yapıldı.',
        token: rescheduleToken
      });
    } catch (error) {
      console.error('Error requesting reschedule:', error);
      res.status(500).json({ error: 'Tarih değişikliği talebi oluşturulurken hata oluştu' });
    }
  });

  // ===== RESCHEDULE ROUTES (must be before /:id route to avoid conflicts) =====
  
  // GET /api/appointments/:id/reschedule-approve/:token - Approve reschedule request
  router.get('/:id/reschedule-approve/:token', async (req, res) => {
    console.log('=== RESCHEDULE APPROVE ENDPOINT HIT ===');
    console.log('URL:', req.url);
    console.log('Path:', req.path);
    console.log('Params:', req.params);
    console.log('Query:', req.query);
    
    try {
      const appointmentId = parseInt(req.params.id);
      let token = req.params.token;

      // Decode token if URL encoded
      try {
        token = decodeURIComponent(token);
      } catch (e) {
        // If decode fails, use original
      }

      console.log('Reschedule approve request:', {
        appointmentId,
        token: token,
        tokenLength: token.length
      });

      // First, check if appointment exists and get current status
      const [appointmentCheck] = await pool.execute(
        `SELECT a.id, a.reschedule_token, a.reschedule_status, a.reschedule_new_date, a.reschedule_new_time
         FROM appointments a
         WHERE a.id = ?`,
        [appointmentId]
      );

      if (appointmentCheck.length === 0) {
        return res.status(404).send(`
          <html>
            <head><title>Geçersiz İstek</title></head>
            <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
              <h1 style="color: #ef4444;">Randevu Bulunamadı</h1>
              <p>Belirtilen randevu bulunamadı.</p>
            </body>
          </html>
        `);
      }

      const currentAppointment = appointmentCheck[0];

      // Normalize tokens for comparison
      const dbToken = currentAppointment.reschedule_token ? String(currentAppointment.reschedule_token).toLowerCase().trim() : null;
      const requestToken = token ? String(token).toLowerCase().trim() : null;

      console.log('Current appointment status (approve):', {
        id: currentAppointment.id,
        dbToken: dbToken,
        dbTokenLength: dbToken ? dbToken.length : 0,
        requestToken: requestToken,
        requestTokenLength: requestToken ? requestToken.length : 0,
        status: currentAppointment.reschedule_status,
        tokenMatch: dbToken === requestToken,
        dbTokenFirst10: dbToken ? dbToken.substring(0, 10) : null,
        requestTokenFirst10: requestToken ? requestToken.substring(0, 10) : null
      });

      // Check if token matches
      const tokenMatches = dbToken && requestToken && dbToken === requestToken;

      if (!dbToken || !tokenMatches) {
        console.error('Token mismatch (approve):', {
          dbToken: dbToken,
          dbTokenLength: dbToken ? dbToken.length : 0,
          requestToken: requestToken,
          requestTokenLength: requestToken ? requestToken.length : 0,
          appointmentId: appointmentId
        });
        return res.status(404).send(`
          <html>
            <head><title>Geçersiz İstek</title></head>
            <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
              <h1 style="color: #ef4444;">Geçersiz Token</h1>
              <p>Bu tarih değişikliği talebi için geçersiz token. Lütfen e-postanızdaki linki kontrol edin veya e-postayı yeniden açmayı deneyin.</p>
              <p style="font-size: 12px; color: #666; margin-top: 20px;">Sorun devam ederse, sistem yöneticisine başvurunuz.</p>
            </body>
          </html>
        `);
      }

      if (currentAppointment.reschedule_status !== 'pending') {
        const statusMessage = currentAppointment.reschedule_status === 'approved' 
          ? 'Bu tarih değişikliği talebi zaten onaylanmış.'
          : currentAppointment.reschedule_status === 'rejected'
          ? 'Bu tarih değişikliği talebi reddedilmiş.'
          : 'Bu tarih değişikliği talebi işlenemiyor.';
        
        return res.status(400).send(`
          <html>
            <head><title>İstek İşlenemiyor</title></head>
            <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
              <h1 style="color: #f59e0b;">${statusMessage}</h1>
              <p>Durum: ${currentAppointment.reschedule_status}</p>
            </body>
          </html>
        `);
      }

      // Get full appointment details
      const [appointments] = await pool.execute(
        `SELECT a.id, a.expert_id, a.user_name, a.user_email, a.user_phone, a.ticket_no,
                DATE_FORMAT(a.appointment_date, '%Y-%m-%d') as appointment_date, a.appointment_time,
                DATE_FORMAT(a.reschedule_new_date, '%Y-%m-%d') as reschedule_new_date, 
                TIME_FORMAT(a.reschedule_new_time, '%H:%i') as reschedule_new_time,
                a.reschedule_reason, a.reschedule_status, a.reschedule_token,
                COALESCE(e.name, 'Bilinmeyen Uzman') as expert_name, e.email as expert_email
         FROM appointments a
         LEFT JOIN experts e ON a.expert_id = e.id
         WHERE a.id = ?`,
        [appointmentId]
      );

      if (appointments.length === 0) {
        return res.status(404).send(`
          <html>
            <head><title>Geçersiz İstek</title></head>
            <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
              <h1 style="color: #ef4444;">Geçersiz veya Süresi Dolmuş İstek</h1>
              <p>Bu tarih değişikliği talebi geçersiz veya süresi dolmuş olabilir.</p>
            </body>
          </html>
        `);
      }

      const appointment = appointments[0];

      // Update appointment with new date and time
      console.log('Updating appointment to approved status:', {
        appointmentId,
        newDate: appointment.reschedule_new_date,
        newTime: appointment.reschedule_new_time,
        currentStatus: appointment.reschedule_status
      });

      const [updateResult] = await pool.execute(
        `UPDATE appointments 
         SET appointment_date = ?, appointment_time = ?, 
             reschedule_status = 'approved', reschedule_token = NULL
         WHERE id = ?`,
        [appointment.reschedule_new_date, appointment.reschedule_new_time, appointmentId]
      );

      console.log('Appointment update result (approve):', {
        appointmentId,
        affectedRows: updateResult.affectedRows,
        changedRows: updateResult.changedRows
      });

      // Verify the update
      const [verifyUpdate] = await pool.execute(
        `SELECT reschedule_status, appointment_date, appointment_time FROM appointments WHERE id = ?`,
        [appointmentId]
      );

      if (verifyUpdate.length > 0) {
        console.log('Verified appointment status after approve:', {
          appointmentId,
          rescheduleStatus: verifyUpdate[0].reschedule_status,
          appointmentDate: verifyUpdate[0].appointment_date,
          appointmentTime: verifyUpdate[0].appointment_time
        });

        if (verifyUpdate[0].reschedule_status !== 'approved') {
          console.error('CRITICAL: Status is not approved after update!', {
            appointmentId,
            expected: 'approved',
            actual: verifyUpdate[0].reschedule_status
          });
        }
      }

      // Log activity for approval
      try {
        await pool.execute(
          `INSERT INTO activity_logs (user_id, user_name, action, entity_type, entity_id, details, ip_address, user_agent)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            null,  // No user ID for automated actions
            'System - Email Link',
            'approve_reschedule',
            'appointment',
            appointmentId,
            JSON.stringify({
              appointment_id: appointmentId,
              old_date: appointment.appointment_date,
              old_time: appointment.appointment_time,
              new_date: appointment.reschedule_new_date,
              new_time: appointment.reschedule_new_time,
              token_verified: true
            }),
            req.ip || req.headers['x-forwarded-for'] || 'unknown',
            req.headers['user-agent'] || 'unknown'
          ]
        );
      } catch (logError) {
        console.error('Error logging approval activity:', logError);
      }

      // Create notification for user
      try {
        await pool.execute(
          `INSERT INTO notifications (user_email, appointment_id, type, title, message, data)
           VALUES (?, ?, 'reschedule_approved', ?, ?, ?)`,
          [
            appointment.user_email,
            appointmentId,
            'Randevu Tarih Değişikliği Onaylandı',
            `Randevu tarihiniz başarıyla güncellendi. Yeni tarih: ${appointment.reschedule_new_date} ${appointment.reschedule_new_time}`,
            JSON.stringify({
              appointment_id: appointmentId,
              old_date: appointment.appointment_date,
              old_time: appointment.appointment_time,
              new_date: appointment.reschedule_new_date,
              new_time: appointment.reschedule_new_time,
              expert_name: appointment.expert_name
            })
          ]
        );
      } catch (notifError) {
        console.error('Error creating notification:', notifError);
        // Continue even if notification creation fails
      }

      // Create notification for expert
      try {
        // Get expert email from database to ensure it's correct
        const [expertData] = await pool.execute(
          'SELECT email FROM experts WHERE id = ?',
          [appointment.expert_id]
        );

        if (expertData.length > 0 && expertData[0].email) {
          const expertEmail = expertData[0].email;
          await pool.execute(
            `INSERT INTO notifications (user_email, appointment_id, type, title, message, data)
             VALUES (?, ?, 'reschedule_approved_expert', ?, ?, ?)`,
            [
              expertEmail,
              appointmentId,
              'Randevu Tarih Değişikliği Onaylandı',
              `Randevu talebinin tarih değişikliği kullanıcı tarafından onaylanmıştır. Yeni tarih: ${appointment.reschedule_new_date} ${appointment.reschedule_new_time}`,
              JSON.stringify({
                appointment_id: appointmentId,
                old_date: appointment.appointment_date,
                old_time: appointment.appointment_time,
                new_date: appointment.reschedule_new_date,
                new_time: appointment.reschedule_new_time,
                user_name: appointment.user_name,
                user_email: appointment.user_email,
                ticket_no: appointment.ticket_no
              })
            ]
          );
        }
      } catch (notifError) {
        console.error('Error creating notification for expert:', notifError);
        // Continue even if notification creation fails
      }

      // Send confirmation email to user
      const { sendRescheduleConfirmationEmail, sendRescheduleConfirmationToExpert } = require('../utils/emailHelper.cjs');
      await sendRescheduleConfirmationEmail(pool, {
        ...appointment,
        appointment_date: appointment.reschedule_new_date,
        appointment_time: appointment.reschedule_new_time
      }, {
        name: appointment.expert_name,
        email: appointment.expert_email
      }, appointment.appointment_date, appointment.appointment_time).catch(error => {
        console.error('Error sending reschedule confirmation email to user:', error);
      });

      // Send confirmation email to expert
      await sendRescheduleConfirmationToExpert(pool, {
        ...appointment,
        appointment_date: appointment.reschedule_new_date,
        appointment_time: appointment.reschedule_new_time
      }, {
        name: appointment.expert_name,
        email: appointment.expert_email
      }, appointment.appointment_date, appointment.appointment_time).catch(error => {
        console.error('Error sending reschedule confirmation email to expert:', error);
      });

      res.send(`
        <html>
          <head><title>Tarih Değişikliği Onaylandı</title></head>
          <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px; background-color: #f0f9ff;">
            <div style="max-width: 600px; margin: 0 auto; background: white; padding: 40px; border-radius: 10px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
              <div style="color: #10b981; font-size: 64px; margin-bottom: 20px;">✓</div>
              <h1 style="color: #10b981; margin-bottom: 20px;">Tarih Değişikliği Onaylandı</h1>
              <p style="color: #6b7280; font-size: 16px; line-height: 1.6;">
                Randevu tarihiniz başarıyla güncellendi.<br>
                <strong>Yeni Tarih:</strong> ${appointment.reschedule_new_date}<br>
                <strong>Yeni Saat:</strong> ${appointment.reschedule_new_time}
              </p>
              <p style="color: #9ca3af; font-size: 14px; margin-top: 30px;">
                Bu sayfayı kapatabilirsiniz.
              </p>
            </div>
          </body>
        </html>
      `);
    } catch (error) {
      console.error('Error approving reschedule:', error);
      res.status(500).send(`
        <html>
          <head><title>Hata</title></head>
          <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
            <h1 style="color: #ef4444;">Bir Hata Oluştu</h1>
            <p>Tarih değişikliği onaylanırken bir hata oluştu. Lütfen daha sonra tekrar deneyin.</p>
          </body>
        </html>
      `);
    }
  });

  // GET /api/appointments/:id/reschedule-reject/:token - Reject reschedule request
  router.get('/:id/reschedule-reject/:token', async (req, res) => {
    console.log('=== RESCHEDULE REJECT ENDPOINT HIT ===');
    console.log('URL:', req.url);
    console.log('Path:', req.path);
    console.log('Params:', req.params);
    console.log('Query:', req.query);
    
    try {
      const appointmentId = parseInt(req.params.id);
      let token = req.params.token;
      const rejectionReason = req.query.reason ? decodeURIComponent(req.query.reason) : 'Kullanıcı onay vermedi';

      // Decode token if URL encoded
      try {
        token = decodeURIComponent(token);
      } catch (e) {
        // If decode fails, use original
      }

      console.log('Reschedule reject request:', {
        appointmentId,
        token: token,
        tokenLength: token.length,
        rejectionReason: rejectionReason
      });

      // First, check if appointment exists and get current status
      const [appointmentCheck] = await pool.execute(
        `SELECT a.id, a.reschedule_token, a.reschedule_status
         FROM appointments a
         WHERE a.id = ?`,
        [appointmentId]
      );

      if (appointmentCheck.length === 0) {
        return res.status(404).send(`
          <html>
            <head><title>Geçersiz İstek</title></head>
            <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
              <h1 style="color: #ef4444;">Randevu Bulunamadı</h1>
              <p>Belirtilen randevu bulunamadı.</p>
            </body>
          </html>
        `);
      }

      const currentAppointment = appointmentCheck[0];

      // Normalize tokens for comparison
      const dbToken = currentAppointment.reschedule_token ? String(currentAppointment.reschedule_token).toLowerCase().trim() : null;
      const requestToken = token ? String(token).toLowerCase().trim() : null;

      console.log('Current appointment status (reject):', {
        id: currentAppointment.id,
        dbToken: dbToken,
        dbTokenLength: dbToken ? dbToken.length : 0,
        requestToken: requestToken,
        requestTokenLength: requestToken ? requestToken.length : 0,
        status: currentAppointment.reschedule_status,
        tokenMatch: dbToken === requestToken,
        dbTokenFirst10: dbToken ? dbToken.substring(0, 10) : null,
        requestTokenFirst10: requestToken ? requestToken.substring(0, 10) : null
      });

      // Check if token matches
      const tokenMatches = dbToken && requestToken && dbToken === requestToken;

      if (!tokenMatches) {
        console.error('Token mismatch (reject):', {
          dbToken: dbToken,
          dbTokenLength: dbToken ? dbToken.length : 0,
          requestToken: requestToken,
          requestTokenLength: requestToken ? requestToken.length : 0,
          appointmentId: appointmentId
        });
        return res.status(404).send(`
          <html>
            <head><title>Geçersiz İstek</title></head>
            <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
              <h1 style="color: #ef4444;">Geçersiz Token</h1>
              <p>Bu tarih değişikliği talebi için geçersiz token. Lütfen e-postanızdaki linki kontrol edin veya e-postayı yeniden açmayı deneyin.</p>
              <p style="font-size: 12px; color: #666; margin-top: 20px;">Sorun devam ederse, sistem yöneticisine başvurunuz.</p>
            </body>
          </html>
        `);
      }

      if (currentAppointment.reschedule_status !== 'pending') {
        const statusMessage = currentAppointment.reschedule_status === 'approved' 
          ? 'Bu tarih değişikliği talebi zaten onaylanmış.'
          : currentAppointment.reschedule_status === 'rejected'
          ? 'Bu tarih değişikliği talebi zaten reddedilmiş.'
          : 'Bu tarih değişikliği talebi işlenemiyor.';
        
        return res.status(400).send(`
          <html>
            <head><title>İstek İşlenemiyor</title></head>
            <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
              <h1 style="color: #f59e0b;">${statusMessage}</h1>
              <p>Durum: ${currentAppointment.reschedule_status}</p>
            </body>
          </html>
        `);
      }

      // Get full appointment details for email
      const [fullAppointments] = await pool.execute(
        `SELECT a.id, a.expert_id, a.user_name, a.user_email, a.user_phone, a.ticket_no,
                DATE_FORMAT(a.appointment_date, '%Y-%m-%d') as appointment_date, a.appointment_time,
                DATE_FORMAT(a.reschedule_new_date, '%Y-%m-%d') as reschedule_new_date, 
                TIME_FORMAT(a.reschedule_new_time, '%H:%i') as reschedule_new_time,
                a.reschedule_reason,
                COALESCE(e.name, 'Bilinmeyen Uzman') as expert_name, e.email as expert_email
         FROM appointments a
         LEFT JOIN experts e ON a.expert_id = e.id
         WHERE a.id = ?`,
        [appointmentId]
      );

      if (fullAppointments.length === 0) {
        return res.status(404).send(`
          <html>
            <head><title>Geçersiz İstek</title></head>
            <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
              <h1 style="color: #ef4444;">Geçersiz veya Süresi Dolmuş İstek</h1>
              <p>Bu tarih değişikliği talebi geçersiz veya süresi dolmuş olabilir.</p>
            </body>
          </html>
        `);
      }

      const appointment = fullAppointments[0];

      // Update reschedule status to rejected with rejection reason
      await pool.execute(
        `UPDATE appointments
         SET reschedule_status = 'rejected', reschedule_token = NULL, reschedule_rejection_reason = ?
         WHERE id = ?`,
        [rejectionReason, appointmentId]
      );

      // Log activity for rejection
      try {
        await pool.execute(
          `INSERT INTO activity_logs (user_id, user_name, action, entity_type, entity_id, details, ip_address, user_agent)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            null,  // No user ID for automated actions
            'System - Email Link',
            'reject_reschedule',
            'appointment',
            appointmentId,
            JSON.stringify({
              appointment_id: appointmentId,
              old_date: appointment.appointment_date,
              old_time: appointment.appointment_time,
              rejected_new_date: appointment.reschedule_new_date,
              rejected_new_time: appointment.reschedule_new_time,
              rejection_reason: rejectionReason,
              token_verified: true
            }),
            req.ip || req.headers['x-forwarded-for'] || 'unknown',
            req.headers['user-agent'] || 'unknown'
          ]
        );
      } catch (logError) {
        console.error('Error logging rejection activity:', logError);
      }

      // Create notification for user
      try {
        await pool.execute(
          `INSERT INTO notifications (user_email, appointment_id, type, title, message, data)
           VALUES (?, ?, 'reschedule_rejected', ?, ?, ?)`,
          [
            appointment.user_email,
            appointmentId,
            'Randevu Tarih Değişikliği Reddedildi',
            `Tarih değişikliği talebiniz reddedildi. Mevcut randevu tarihiniz aynı kalacaktır.`,
            JSON.stringify({
              appointment_id: appointmentId,
              current_date: appointment.appointment_date,
              current_time: appointment.appointment_time,
              rejected_new_date: appointment.reschedule_new_date,
              rejected_new_time: appointment.reschedule_new_time,
              rejection_reason: rejectionReason,
              expert_name: appointment.expert_name
            })
          ]
        );
      } catch (notifError) {
        console.error('Error creating notification:', notifError);
        // Continue even if notification creation fails
      }

      // Create notification for expert
      try {
        await pool.execute(
          `INSERT INTO notifications (user_email, appointment_id, type, title, message, data)
           VALUES (?, ?, 'reschedule_rejected_expert', ?, ?, ?)`,
          [
            appointment.expert_email,
            appointmentId,
            'Randevu Tarih Değişikliği Reddedildi',
            `Randevu talebinin tarih değişikliği kullanıcı tarafından reddedilmiştir. Sebep: ${rejectionReason}`,
            JSON.stringify({
              appointment_id: appointmentId,
              current_date: appointment.appointment_date,
              current_time: appointment.appointment_time,
              rejected_new_date: appointment.reschedule_new_date,
              rejected_new_time: appointment.reschedule_new_time,
              rejection_reason: rejectionReason,
              user_name: appointment.user_name,
              user_email: appointment.user_email,
              ticket_no: appointment.ticket_no
            })
          ]
        );
      } catch (notifError) {
        console.error('Error creating notification for expert:', notifError);
        // Continue even if notification creation fails
      }

      // Send rejection email to user
      const { sendRescheduleRejectionEmail, sendRescheduleRejectionToExpert } = require('../utils/emailHelper.cjs');
      await sendRescheduleRejectionEmail(pool, appointment, {
        name: appointment.expert_name,
        email: appointment.expert_email
      }, appointment.reschedule_new_date, appointment.reschedule_new_time, rejectionReason).catch(error => {
        console.error('Error sending reschedule rejection email to user:', error);
      });

      // Send rejection email to expert
      await sendRescheduleRejectionToExpert(pool, appointment, {
        name: appointment.expert_name,
        email: appointment.expert_email
      }, appointment.reschedule_new_date, appointment.reschedule_new_time, rejectionReason).catch(error => {
        console.error('Error sending reschedule rejection email to expert:', error);
      });

      res.send(`
        <html>
          <head><title>Tarih Değişikliği Reddedildi</title></head>
          <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px; background-color: #fef2f2;">
            <div style="max-width: 600px; margin: 0 auto; background: white; padding: 40px; border-radius: 10px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
              <div style="color: #ef4444; font-size: 64px; margin-bottom: 20px;">✕</div>
              <h1 style="color: #ef4444; margin-bottom: 20px;">Tarih Değişikliği Reddedildi</h1>
              <p style="color: #6b7280; font-size: 16px; line-height: 1.6;">
                Tarih değişikliği talebiniz reddedildi.<br>
                Mevcut randevu tarihiniz aynı kalacaktır.
              </p>
              <p style="color: #9ca3af; font-size: 14px; margin-top: 30px;">
                Bu sayfayı kapatabilirsiniz.
              </p>
            </div>
          </body>
        </html>
      `);
    } catch (error) {
      console.error('Error rejecting reschedule:', error);
      res.status(500).send(`
        <html>
          <head><title>Hata</title></head>
          <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
            <h1 style="color: #ef4444;">Bir Hata Oluştu</h1>
            <p>Tarih değişikliği reddedilirken bir hata oluştu. Lütfen daha sonra tekrar deneyin.</p>
          </body>
        </html>
      `);
    }
  });

  return router;
};
