const express = require('express');
const router = express.Router();

module.exports = (pool) => {
  // GET /api/notifications - Get notifications for a user email
  router.get('/', async (req, res) => {
    try {
      const userEmail = req.query.email;

      if (!userEmail) {
        return res.status(400).json({ error: 'E-posta adresi gereklidir' });
      }

      const [notifications] = await pool.execute(
        `SELECT n.id, n.user_email, n.appointment_id, n.type, n.title, n.message, 
                n.is_read, n.data, n.created_at, n.read_at,
                DATE_FORMAT(a.appointment_date, '%Y-%m-%d') as appointment_date,
                TIME_FORMAT(a.appointment_time, '%H:%i') as appointment_time,
                a.user_name, a.ticket_no,
                COALESCE(e.name, 'Bilinmeyen Uzman') as expert_name
         FROM notifications n
         LEFT JOIN appointments a ON n.appointment_id = a.id
         LEFT JOIN experts e ON a.expert_id = e.id
         WHERE n.user_email = ?
         ORDER BY n.created_at DESC
         LIMIT 50`,
        [userEmail]
      );

      const unreadCount = notifications.filter(n => !n.is_read).length;

      res.json({
        notifications,
        unreadCount
      });
    } catch (error) {
      console.error('Error fetching notifications:', error);
      res.status(500).json({ error: 'Bildirimler alınırken hata oluştu' });
    }
  });

  // PUT /api/notifications/:id/read - Mark notification as read
  router.put('/:id/read', async (req, res) => {
    try {
      const notificationId = parseInt(req.params.id);

      await pool.execute(
        `UPDATE notifications 
         SET is_read = TRUE, read_at = NOW()
         WHERE id = ?`,
        [notificationId]
      );

      res.json({ message: 'Bildirim okundu olarak işaretlendi' });
    } catch (error) {
      console.error('Error marking notification as read:', error);
      res.status(500).json({ error: 'Bildirim güncellenirken hata oluştu' });
    }
  });

  // PUT /api/notifications/read-all - Mark all notifications as read for a user
  router.put('/read-all', async (req, res) => {
    try {
      const userEmail = req.body.email;

      if (!userEmail) {
        return res.status(400).json({ error: 'E-posta adresi gereklidir' });
      }

      await pool.execute(
        `UPDATE notifications 
         SET is_read = TRUE, read_at = NOW()
         WHERE user_email = ? AND is_read = FALSE`,
        [userEmail]
      );

      res.json({ message: 'Tüm bildirimler okundu olarak işaretlendi' });
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
      res.status(500).json({ error: 'Bildirimler güncellenirken hata oluştu' });
    }
  });

  // GET /api/notifications/:id - Get notification details
  router.get('/:id', async (req, res) => {
    try {
      const notificationId = parseInt(req.params.id);

      const [notifications] = await pool.execute(
        `SELECT n.id, n.user_email, n.appointment_id, n.type, n.title, n.message, 
                n.is_read, n.data, n.created_at, n.read_at,
                DATE_FORMAT(a.appointment_date, '%Y-%m-%d') as appointment_date,
                TIME_FORMAT(a.appointment_time, '%H:%i') as appointment_time,
                a.user_name, a.ticket_no, a.status as appointment_status,
                COALESCE(e.name, 'Bilinmeyen Uzman') as expert_name, e.email as expert_email
         FROM notifications n
         LEFT JOIN appointments a ON n.appointment_id = a.id
         LEFT JOIN experts e ON a.expert_id = e.id
         WHERE n.id = ?`,
        [notificationId]
      );

      if (notifications.length === 0) {
        return res.status(404).json({ error: 'Bildirim bulunamadı' });
      }

      // Mark as read if not already read
      if (!notifications[0].is_read) {
        await pool.execute(
          `UPDATE notifications 
           SET is_read = TRUE, read_at = NOW()
           WHERE id = ?`,
          [notificationId]
        );
        notifications[0].is_read = true;
      }

      res.json(notifications[0]);
    } catch (error) {
      console.error('Error fetching notification:', error);
      res.status(500).json({ error: 'Bildirim alınırken hata oluştu' });
    }
  });

  return router;
};

