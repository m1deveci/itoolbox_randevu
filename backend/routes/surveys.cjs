const express = require('express');
const router = express.Router();

module.exports = (pool) => {
  // POST /api/surveys - Submit survey response
  router.post('/', async (req, res) => {
    try {
      const { appointmentId, serviceSatisfaction, systemSatisfaction, problemDescription } = req.body;

      // Validate required fields
      if (!appointmentId || !serviceSatisfaction || !systemSatisfaction) {
        return res.status(400).json({
          error: 'appointmentId, serviceSatisfaction ve systemSatisfaction alanları zorunludur'
        });
      }

      // Validate rating values
      if (![1, 2, 3, 4, 5].includes(serviceSatisfaction) || ![1, 2, 3, 4, 5].includes(systemSatisfaction)) {
        return res.status(400).json({
          error: 'Rating değerleri 1-5 arasında olmalıdır'
        });
      }

      // Get appointment details to verify it exists and get user email
      const [appointments] = await pool.execute(
        `SELECT a.id, a.user_email, a.user_name
         FROM appointments
         WHERE id = ?`,
        [appointmentId]
      );

      if (appointments.length === 0) {
        return res.status(404).json({ error: 'Randevu bulunamadı' });
      }

      const appointment = appointments[0];

      // Check if survey already exists for this appointment
      const [existingSurvey] = await pool.execute(
        'SELECT id FROM appointment_surveys WHERE appointment_id = ?',
        [appointmentId]
      );

      if (existingSurvey.length > 0) {
        // Update existing survey
        await pool.execute(
          `UPDATE appointment_surveys
           SET service_satisfaction = ?, system_satisfaction = ?, problem_description = ?
           WHERE appointment_id = ?`,
          [serviceSatisfaction, systemSatisfaction, problemDescription || null, appointmentId]
        );
      } else {
        // Insert new survey
        await pool.execute(
          `INSERT INTO appointment_surveys
           (appointment_id, user_email, service_satisfaction, system_satisfaction, problem_description)
           VALUES (?, ?, ?, ?, ?)`,
          [appointmentId, appointment.user_email, serviceSatisfaction, systemSatisfaction, problemDescription || null]
        );
      }

      res.status(201).json({
        message: 'Anket başarıyla kaydedildi',
        appointmentId
      });
    } catch (error) {
      console.error('Error submitting survey:', error);
      res.status(500).json({ error: 'Anket kaydedilirken bir hata oluştu' });
    }
  });

  // GET /api/surveys - Get all surveys (for admin)
  router.get('/', async (req, res) => {
    try {
      const [surveys] = await pool.execute(
        `SELECT s.id, s.appointment_id, s.user_email, s.service_satisfaction,
                s.system_satisfaction, s.problem_description, s.created_at,
                a.user_name, a.ticket_no, DATE_FORMAT(a.appointment_date, '%Y-%m-%d') as appointment_date,
                a.appointment_time
         FROM appointment_surveys s
         JOIN appointments a ON s.appointment_id = a.id
         ORDER BY s.created_at DESC
         LIMIT 100`
      );

      res.json({ surveys });
    } catch (error) {
      console.error('Error fetching surveys:', error);
      res.status(500).json({ error: 'Anketler yüklenirken bir hata oluştu' });
    }
  });

  // GET /api/surveys/:appointmentId - Get survey for specific appointment
  router.get('/:appointmentId', async (req, res) => {
    try {
      const [survey] = await pool.execute(
        `SELECT * FROM appointment_surveys WHERE appointment_id = ?`,
        [parseInt(req.params.appointmentId)]
      );

      if (survey.length === 0) {
        return res.status(404).json({ error: 'Anket bulunamadı' });
      }

      res.json({ survey: survey[0] });
    } catch (error) {
      console.error('Error fetching survey:', error);
      res.status(500).json({ error: 'Anket yüklenirken bir hata oluştu' });
    }
  });

  // GET /api/surveys/stats/summary - Get survey statistics
  router.get('/stats/summary', async (req, res) => {
    try {
      const [stats] = await pool.execute(
        `SELECT
          COUNT(*) as total_surveys,
          AVG(service_satisfaction) as avg_service_satisfaction,
          AVG(system_satisfaction) as avg_system_satisfaction
         FROM appointment_surveys`
      );

      res.json({ statistics: stats[0] });
    } catch (error) {
      console.error('Error fetching survey stats:', error);
      res.status(500).json({ error: 'İstatistikler yüklenirken bir hata oluştu' });
    }
  });

  return router;
};
