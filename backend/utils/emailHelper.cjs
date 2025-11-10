const nodemailer = require('nodemailer');

/**
 * Get SMTP settings from database
 */
async function getSmtpSettings(pool) {
  try {
    const [settings] = await pool.execute(
      'SELECT key_name, value FROM settings WHERE key_name LIKE "smtp_%"'
    );
    
    const smtpSettings = {};
    settings.forEach(setting => {
      smtpSettings[setting.key_name] = setting.value;
    });
    
    return smtpSettings;
  } catch (error) {
    console.error('Error fetching SMTP settings:', error);
    return null;
  }
}

/**
 * Create nodemailer transporter from SMTP settings
 */
async function createTransporter(pool) {
  const smtpSettings = await getSmtpSettings(pool);
  
  if (!smtpSettings || smtpSettings.smtp_enabled !== 'true') {
    return null;
  }
  
  if (!smtpSettings.smtp_host || !smtpSettings.smtp_port || !smtpSettings.smtp_user) {
    return null;
  }
  
  return nodemailer.createTransport({
    host: smtpSettings.smtp_host,
    port: parseInt(smtpSettings.smtp_port) || 587,
    secure: parseInt(smtpSettings.smtp_port) === 465, // true for 465, false for other ports
    auth: {
      user: smtpSettings.smtp_user,
      pass: smtpSettings.smtp_password || ''
    }
  });
}

/**
 * Send email notification
 */
async function sendEmail(pool, options) {
  try {
    const transporter = await createTransporter(pool);
    
    if (!transporter) {
      console.log('SMTP is not configured or disabled, skipping email');
      return false;
    }
    
    const smtpSettings = await getSmtpSettings(pool);
    const fromEmail = smtpSettings?.smtp_from_email || smtpSettings?.smtp_user;
    const fromName = smtpSettings?.smtp_from_name || 'IT Randevu Sistemi';
    
    const mailOptions = {
      from: `"${fromName}" <${fromEmail}>`,
      to: options.to,
      subject: options.subject,
      text: options.text,
      html: options.html
    };
    
    await transporter.sendMail(mailOptions);
    console.log('Email sent successfully to:', options.to);
    return true;
  } catch (error) {
    console.error('Error sending email:', error);
    return false;
  }
}

/**
 * Send appointment notification to expert
 */
async function sendAppointmentNotificationToExpert(pool, appointment, expert) {
  const appointmentDate = new Date(appointment.appointment_date + 'T00:00:00');
  const formattedDate = appointmentDate.toLocaleDateString('tr-TR', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
  
  const subject = `Yeni Randevu Talebi - ${formattedDate}`;
  const text = `
Merhaba ${expert.name},

Yeni bir randevu talebi aldınız:

Randevu Detayları:
- Tarih: ${formattedDate}
- Saat: ${appointment.appointment_time.substring(0, 5)}
- Müşteri: ${appointment.user_name}
- E-posta: ${appointment.user_email}
- Telefon: ${appointment.user_phone}
- Ticket No: ${appointment.ticket_no}
${appointment.notes ? `- Notlar: ${appointment.notes}` : ''}

Randevuyu onaylamak veya reddetmek için sisteme giriş yapabilirsiniz.

İyi çalışmalar,
IT Randevu Sistemi
  `;
  
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #3b82f6;">Yeni Randevu Talebi</h2>
      <p>Merhaba <strong>${expert.name}</strong>,</p>
      <p>Yeni bir randevu talebi aldınız:</p>
      
      <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <h3 style="margin-top: 0; color: #1f2937;">Randevu Detayları</h3>
        <p><strong>Tarih:</strong> ${formattedDate}</p>
        <p><strong>Saat:</strong> ${appointment.appointment_time.substring(0, 5)}</p>
        <p><strong>Müşteri:</strong> ${appointment.user_name}</p>
        <p><strong>E-posta:</strong> ${appointment.user_email}</p>
        <p><strong>Telefon:</strong> ${appointment.user_phone}</p>
        <p><strong>Ticket No:</strong> ${appointment.ticket_no}</p>
        ${appointment.notes ? `<p><strong>Notlar:</strong> ${appointment.notes}</p>` : ''}
      </div>
      
      <p>Randevuyu onaylamak veya reddetmek için sisteme giriş yapabilirsiniz.</p>
      
      <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
        İyi çalışmalar,<br>
        IT Randevu Sistemi
      </p>
    </div>
  `;
  
  return await sendEmail(pool, {
    to: expert.email,
    subject,
    text,
    html
  });
}

/**
 * Send appointment approval notification to user
 */
async function sendAppointmentApprovalToUser(pool, appointment, expert) {
  const appointmentDate = new Date(appointment.appointment_date + 'T00:00:00');
  const formattedDate = appointmentDate.toLocaleDateString('tr-TR', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
  
  const subject = `Randevunuz Onaylandı - ${formattedDate}`;
  const text = `
Merhaba ${appointment.user_name},

Randevu talebiniz onaylanmıştır.

Randevu Detayları:
- Tarih: ${formattedDate}
- Saat: ${appointment.appointment_time.substring(0, 5)}
- IT Uzmanı: ${expert.name}
- Ticket No: ${appointment.ticket_no}

Randevu tarihinizde hazır olmanızı rica ederiz.

İyi günler,
IT Randevu Sistemi
  `;
  
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #10b981;">Randevunuz Onaylandı</h2>
      <p>Merhaba <strong>${appointment.user_name}</strong>,</p>
      <p>Randevu talebiniz onaylanmıştır.</p>
      
      <div style="background-color: #d1fae5; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #10b981;">
        <h3 style="margin-top: 0; color: #1f2937;">Randevu Detayları</h3>
        <p><strong>Tarih:</strong> ${formattedDate}</p>
        <p><strong>Saat:</strong> ${appointment.appointment_time.substring(0, 5)}</p>
        <p><strong>IT Uzmanı:</strong> ${expert.name}</p>
        <p><strong>Ticket No:</strong> ${appointment.ticket_no}</p>
      </div>
      
      <p>Randevu tarihinizde hazır olmanızı rica ederiz.</p>
      
      <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
        İyi günler,<br>
        IT Randevu Sistemi
      </p>
    </div>
  `;
  
  return await sendEmail(pool, {
    to: appointment.user_email,
    subject,
    text,
    html
  });
}

/**
 * Send appointment cancellation notification to user
 */
async function sendAppointmentCancellationToUser(pool, appointment, expert, cancellationReason) {
  const appointmentDate = new Date(appointment.appointment_date + 'T00:00:00');
  const formattedDate = appointmentDate.toLocaleDateString('tr-TR', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
  
  const subject = `Randevunuz İptal Edildi - ${formattedDate}`;
  const text = `
Merhaba ${appointment.user_name},

Maalesef randevu talebiniz iptal edilmiştir.

Randevu Detayları:
- Tarih: ${formattedDate}
- Saat: ${appointment.appointment_time.substring(0, 5)}
- IT Uzmanı: ${expert.name}
- Ticket No: ${appointment.ticket_no}
${cancellationReason ? `- İptal Sebebi: ${cancellationReason}` : ''}

Yeni bir randevu oluşturmak için sistemi tekrar ziyaret edebilirsiniz.

İyi günler,
IT Randevu Sistemi
  `;
  
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #ef4444;">Randevunuz İptal Edildi</h2>
      <p>Merhaba <strong>${appointment.user_name}</strong>,</p>
      <p>Maalesef randevu talebiniz iptal edilmiştir.</p>
      
      <div style="background-color: #fee2e2; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ef4444;">
        <h3 style="margin-top: 0; color: #1f2937;">Randevu Detayları</h3>
        <p><strong>Tarih:</strong> ${formattedDate}</p>
        <p><strong>Saat:</strong> ${appointment.appointment_time.substring(0, 5)}</p>
        <p><strong>IT Uzmanı:</strong> ${expert.name}</p>
        <p><strong>Ticket No:</strong> ${appointment.ticket_no}</p>
        ${cancellationReason ? `<p><strong>İptal Sebebi:</strong> ${cancellationReason}</p>` : ''}
      </div>
      
      <p>Yeni bir randevu oluşturmak için sistemi tekrar ziyaret edebilirsiniz.</p>
      
      <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
        İyi günler,<br>
        IT Randevu Sistemi
      </p>
    </div>
  `;
  
  return await sendEmail(pool, {
    to: appointment.user_email,
    subject,
    text,
    html
  });
}

module.exports = {
  sendEmail,
  sendAppointmentNotificationToExpert,
  sendAppointmentApprovalToUser,
  sendAppointmentCancellationToUser
};

