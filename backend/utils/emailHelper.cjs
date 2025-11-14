const nodemailer = require('nodemailer');

/**
 * Get site title from database
 */
async function getSiteTitle(pool) {
  try {
    const [result] = await pool.execute(
      'SELECT value FROM settings WHERE key_name = ?',
      ['site_title']
    );

    if (result.length > 0) {
      return result[0].value || 'Ravago IT Randevu Sistemi';
    }
    return 'Ravago IT Randevu Sistemi';
  } catch (error) {
    console.error('Error fetching site title:', error);
    return 'Ravago IT Randevu Sistemi';
  }
}

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
    const fromName = smtpSettings?.smtp_from_name || 'Ravago IT Randevu Sistemi';

    const mailOptions = {
      from: `"${fromName}" <${fromEmail}>`,
      to: options.to,
      subject: options.subject,
      text: options.text,
      html: options.html
    };

    // Add attachments if provided
    if (options.attachments && options.attachments.length > 0) {
      mailOptions.attachments = options.attachments;
    }

    await transporter.sendMail(mailOptions);
    console.log('Email sent successfully to:', options.to);
    return true;
  } catch (error) {
    console.error('Error sending email:', error);
    return false;
  }
}

/**
 * Create iCalendar (.ics) content for appointment
 */
function createICalendarContent(appointment, expert) {
  // Parse appointment date and time
  let appointmentDate = appointment.appointment_date;
  let appointmentTime = appointment.appointment_time;

  // Handle if appointment_date is a Date object
  if (appointmentDate instanceof Date) {
    const year = appointmentDate.getFullYear();
    const month = String(appointmentDate.getMonth() + 1).padStart(2, '0');
    const day = String(appointmentDate.getDate()).padStart(2, '0');
    appointmentDate = `${year}-${month}-${day}`;
  }

  // Ensure time format is HH:MM
  if (appointmentTime && appointmentTime.length > 5) {
    appointmentTime = appointmentTime.substring(0, 5);
  }

  // Create datetime strings for iCalendar (UTC format)
  // Format: 20231220T100000Z (local time converted to UTC would need timezone info, using local time)
  const dateTimeParts = appointmentDate.split('-');
  const timeParts = appointmentTime.split(':');

  const dtstart = `${dateTimeParts.join('')}T${timeParts.join('')}00`;
  // End time is 1 hour after start time
  let endHour = parseInt(timeParts[0]) + 1;
  const dtend = `${dateTimeParts.join('')}T${String(endHour).padStart(2, '0')}${timeParts[1]}00`;

  // Create unique ID for this appointment
  const uid = `appointment-${appointment.id || Date.now()}@randevu.local`;

  // Current timestamp for DTSTAMP
  const now = new Date();
  const dtstamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

  const icsContent = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//IT Randevu//Ravago IT Randevu Sistemi//EN
CALSCALE:GREGORIAN
METHOD:PUBLISH
X-WR-CALNAME:IT Uzman Randevusu
X-WR-TIMEZONE:Europe/Istanbul
BEGIN:VEVENT
UID:${uid}
DTSTAMP:${dtstamp}Z
DTSTART:${dtstart}
DTEND:${dtend}
SUMMARY:IT Uzman Randevusu - ${expert.name}
DESCRIPTION:Ticket No: ${appointment.ticket_no}\\nIT Uzmanı: ${expert.name}\\nÇalışan: ${appointment.user_name}
LOCATION:
STATUS:CONFIRMED
SEQUENCE:0
END:VEVENT
END:VCALENDAR`;

  return icsContent;
}

/**
 * Send appointment notification to expert
 */
async function sendAppointmentNotificationToExpert(pool, siteTitle, appointment, expert) {
  // If siteTitle not provided, fetch from database (backward compatibility)
  if (!siteTitle || typeof siteTitle === 'object') {
    // siteTitle is actually appointment (old signature)
    const tempAppointment = siteTitle;
    expert = appointment;
    appointment = tempAppointment;
    siteTitle = await getSiteTitle(pool);
  }

  // Validate and parse appointment date
  if (!appointment.appointment_date) {
    console.error('Appointment date is missing');
    return false;
  }

  let appointmentDate;
  if (appointment.appointment_date instanceof Date) {
    appointmentDate = appointment.appointment_date;
  } else {
    appointmentDate = new Date(appointment.appointment_date + 'T00:00:00');
  }

  // Check if date is valid
  if (isNaN(appointmentDate.getTime())) {
    console.error('Invalid appointment date:', appointment.appointment_date);
    return false;
  }

  const formattedDate = appointmentDate.toLocaleDateString('tr-TR', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  const subject = `${siteTitle} - Yeni Randevu Talebi - ${formattedDate}`;
  const text = `
Merhaba ${expert.name},

Yeni bir randevu talebi aldınız:

Randevu Detayları:
- Tarih: ${formattedDate}
- Saat: ${appointment.appointment_time.substring(0, 5)}
- Çalışan: ${appointment.user_name}
- E-posta: ${appointment.user_email}
- Telefon: ${appointment.user_phone}
- Ticket No: ${appointment.ticket_no}
${appointment.notes ? `- Notlar: ${appointment.notes}` : ''}

Randevuyu onaylamak veya reddetmek için sisteme giriş yapabilirsiniz.

İyi çalışmalar,
Ravago IT Randevu Sistemi
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
        <p><strong>Çalışan:</strong> ${appointment.user_name}</p>
        <p><strong>E-posta:</strong> ${appointment.user_email}</p>
        <p><strong>Telefon:</strong> ${appointment.user_phone}</p>
        <p><strong>Ticket No:</strong> ${appointment.ticket_no}</p>
        ${appointment.notes ? `<p><strong>Notlar:</strong> ${appointment.notes}</p>` : ''}
      </div>

      <p>Randevuyu onaylamak veya reddetmek için sisteme giriş yapabilirsiniz.</p>

      <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
        İyi çalışmalar,<br>
        Ravago IT Randevu Sistemi
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
async function sendAppointmentApprovalToUser(pool, siteTitle, appointment, expert) {
  // If siteTitle not provided, fetch from database (backward compatibility)
  if (!siteTitle || typeof siteTitle === 'object') {
    // siteTitle is actually appointment (old signature)
    const tempAppointment = siteTitle;
    expert = appointment;
    appointment = tempAppointment;
    siteTitle = await getSiteTitle(pool);
  }

  // Validate and parse appointment date
  if (!appointment.appointment_date) {
    console.error('Appointment date is missing');
    return false;
  }

  let appointmentDate;
  if (appointment.appointment_date instanceof Date) {
    appointmentDate = appointment.appointment_date;
  } else {
    appointmentDate = new Date(appointment.appointment_date + 'T00:00:00');
  }

  // Check if date is valid
  if (isNaN(appointmentDate.getTime())) {
    console.error('Invalid appointment date:', appointment.appointment_date);
    return false;
  }

  const formattedDate = appointmentDate.toLocaleDateString('tr-TR', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  const subject = `${siteTitle} - Randevunuz Onaylandı - ${formattedDate}`;
  const text = `
Merhaba ${appointment.user_name},

Randevu talebiniz onaylanmıştır.

Randevu Detayları:
- Tarih: ${formattedDate}
- Saat: ${appointment.appointment_time.substring(0, 5)}
- IT Uzmanı: ${expert.name}
- Ticket No: ${appointment.ticket_no}

Randevu tarihinizde hazır olmanızı rica ederiz.

ÖNEMLİ: Randevu saatinizden 5 dakika önce bulunduğunuz lokasyondaki IT ofisinde olunuz.

İyi günler,
Ravago IT Randevu Sistemi
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

      <div style="background-color: #fef3c7; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #f59e0b;">
        <p style="margin: 0; color: #92400e; font-size: 14px;">
          ⚠️ <strong>Önemli:</strong> Randevu saatinizden 5 dakika önce bulunduğunuz lokasyondaki IT ofisinde olunuz.
        </p>
      </div>

      <div style="background-color: #f0f9ff; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #3b82f6;">
        <p style="margin: 0; color: #1e40af; font-size: 13px;">
          💡 <strong>İpucu:</strong> E-postaya eklenen takvim dosyasını (.ics) indirerek Outlook, Google Calendar veya diğer takvim uygulamalarınıza ekleyebilirsiniz.
        </p>
      </div>

      <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
        İyi günler,<br>
        Ravago IT Randevu Sistemi
      </p>
    </div>
  `;

  // Create iCalendar attachment
  const icsContent = createICalendarContent(appointment, expert);
  const attachments = [
    {
      filename: `randevu-${appointment.id || 'taslak'}.ics`,
      content: icsContent,
      contentType: 'text/calendar; method=REQUEST; charset="UTF-8"'
    }
  ];

  return await sendEmail(pool, {
    to: appointment.user_email,
    subject,
    text,
    html,
    attachments
  });
}

/**
 * Send appointment approval notification to expert
 */
async function sendAppointmentApprovalToExpert(pool, siteTitle, appointment, expert) {
  // If siteTitle not provided, fetch from database (backward compatibility)
  if (!siteTitle || typeof siteTitle === 'object') {
    // siteTitle is actually appointment (old signature)
    const tempAppointment = siteTitle;
    expert = appointment;
    appointment = tempAppointment;
    siteTitle = await getSiteTitle(pool);
  }

  // Validate and parse appointment date
  if (!appointment.appointment_date) {
    console.error('Appointment date is missing');
    return false;
  }

  let appointmentDate;
  if (appointment.appointment_date instanceof Date) {
    appointmentDate = appointment.appointment_date;
  } else {
    appointmentDate = new Date(appointment.appointment_date + 'T00:00:00');
  }

  // Check if date is valid
  if (isNaN(appointmentDate.getTime())) {
    console.error('Invalid appointment date:', appointment.appointment_date);
    return false;
  }

  const formattedDate = appointmentDate.toLocaleDateString('tr-TR', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  const subject = `${siteTitle} - Randevuyu Onayladınız - ${formattedDate}`;
  const text = `
Merhaba ${expert.name},

Randevu talebini onayladınız.

Randevu Detayları:
- Tarih: ${formattedDate}
- Saat: ${appointment.appointment_time.substring(0, 5)}
- Çalışan: ${appointment.user_name}
- E-posta: ${appointment.user_email}
- Telefon: ${appointment.user_phone}
- Ticket No: ${appointment.ticket_no}

Bu randevu için takvim dosyası e-postaya eklenmiştir.

İyi çalışmalar,
Ravago IT Randevu Sistemi
  `;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #10b981;">Randevuyu Onayladınız</h2>
      <p>Merhaba <strong>${expert.name}</strong>,</p>
      <p>Randevu talebini onayladınız.</p>

      <div style="background-color: #d1fae5; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #10b981;">
        <h3 style="margin-top: 0; color: #1f2937;">Randevu Detayları</h3>
        <p><strong>Tarih:</strong> ${formattedDate}</p>
        <p><strong>Saat:</strong> ${appointment.appointment_time.substring(0, 5)}</p>
        <p><strong>Çalışan:</strong> ${appointment.user_name}</p>
        <p><strong>E-posta:</strong> ${appointment.user_email}</p>
        <p><strong>Telefon:</strong> ${appointment.user_phone}</p>
        <p><strong>Ticket No:</strong> ${appointment.ticket_no}</p>
      </div>

      <div style="background-color: #f0f9ff; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #3b82f6;">
        <p style="margin: 0; color: #1e40af; font-size: 13px;">
          📅 <strong>Takvim Dosyası:</strong> E-postaya eklenen takvim dosyasını (.ics) indirerek Outlook, Google Calendar veya diğer takvim uygulamalarınıza ekleyebilirsiniz.
        </p>
      </div>

      <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
        İyi çalışmalar,<br>
        Ravago IT Randevu Sistemi
      </p>
    </div>
  `;

  // Create iCalendar attachment
  const icsContent = createICalendarContent(appointment, expert);
  const attachments = [
    {
      filename: `randevu-${appointment.id || 'taslak'}.ics`,
      content: icsContent,
      contentType: 'text/calendar; method=REQUEST; charset="UTF-8"'
    }
  ];

  return await sendEmail(pool, {
    to: expert.email,
    subject,
    text,
    html,
    attachments
  });
}

/**
 * Send appointment cancellation notification to user
 */
async function sendAppointmentCancellationToUser(pool, siteTitle, appointment, expert, cancellationReason) {
  // If siteTitle not provided, fetch from database (backward compatibility)
  if (!siteTitle || typeof siteTitle === 'object') {
    // siteTitle is actually appointment (old signature)
    const tempAppointment = siteTitle;
    const tempExpert = appointment;
    cancellationReason = expert; // In old signature, expert parameter is actually cancellationReason
    appointment = tempAppointment;
    expert = tempExpert;
    siteTitle = await getSiteTitle(pool);
  }

  // Validate and parse appointment date
  if (!appointment.appointment_date) {
    console.error('Appointment date is missing');
    return false;
  }

  let appointmentDate;
  if (appointment.appointment_date instanceof Date) {
    appointmentDate = appointment.appointment_date;
  } else {
    appointmentDate = new Date(appointment.appointment_date + 'T00:00:00');
  }

  // Check if date is valid
  if (isNaN(appointmentDate.getTime())) {
    console.error('Invalid appointment date:', appointment.appointment_date);
    return false;
  }

  const formattedDate = appointmentDate.toLocaleDateString('tr-TR', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  const subject = `${siteTitle} - Randevunuz İptal Edildi - ${formattedDate}`;
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
Ravago IT Randevu Sistemi
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
        Ravago Ravago IT Randevu Sistemi
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
 * Send appointment reassignment notification to old expert
 */
async function sendReassignmentNotificationToOldExpert(pool, siteTitle, appointment, oldExpert, newExpert) {
  try {
    // If siteTitle not provided, fetch from database (backward compatibility)
    if (!siteTitle || typeof siteTitle === 'object') {
      // siteTitle is actually appointment (old signature)
      const tempAppointment = siteTitle;
      const tempOldExpert = appointment;
      const tempNewExpert = oldExpert;
      appointment = tempAppointment;
      oldExpert = tempOldExpert;
      newExpert = tempNewExpert;
      siteTitle = await getSiteTitle(pool);
    }

    // Validate and parse appointment date
    if (!appointment.appointment_date) {
      console.error('Appointment date is missing');
      return false;
    }

    let appointmentDate;
    if (appointment.appointment_date instanceof Date) {
      appointmentDate = appointment.appointment_date;
    } else {
      appointmentDate = new Date(appointment.appointment_date + 'T00:00:00');
    }

    // Check if date is valid
    if (isNaN(appointmentDate.getTime())) {
      console.error('Invalid appointment date:', appointment.appointment_date);
      return false;
    }

    const formattedDate = appointmentDate.toLocaleDateString('tr-TR', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    const subject = `${siteTitle} - Randevu Ataması Değiştirildi - ${formattedDate}`;
    const text = `
Merhaba ${oldExpert.name},

Sizin için önemli bir bildirim:

Randevu talebinizin ataması başka bir IT Uzmanına devredilmiştir.

Randevu Detayları:
- Tarih: ${formattedDate}
- Saat: ${appointment.appointment_time.substring(0, 5)}
- Çalışan: ${appointment.user_name}
- Ticket No: ${appointment.ticket_no}
- Yeni Atanan Uzman: ${newExpert.name}

Bu randevu artık sizin sorumluluğunuzda değildir.

İyi çalışmalar,
Ravago Ravago IT Randevu Sistemi
    `;

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #f59e0b;">Randevu Ataması Değiştirildi</h2>
        <p>Merhaba <strong>${oldExpert.name}</strong>,</p>
        <p>Sizin için önemli bir bildirim:</p>

        <div style="background-color: #fef3c7; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #f59e0b;">
          <h3 style="margin-top: 0; color: #1f2937;">Randevu Taşıma Detayları</h3>
          <p><strong>Tarih:</strong> ${formattedDate}</p>
          <p><strong>Saat:</strong> ${appointment.appointment_time.substring(0, 5)}</p>
          <p><strong>Çalışan:</strong> ${appointment.user_name}</p>
          <p><strong>Ticket No:</strong> ${appointment.ticket_no}</p>
          <p><strong>Yeni Atanan Uzman:</strong> <span style="color: #10b981; font-weight: bold;">${newExpert.name}</span></p>
          <p style="margin-bottom: 0;"><strong>Taşıma Sebebi:</strong> ${appointment.reassignment_reason || 'Belirtilmemiş'}</p>
        </div>

        <p style="color: #6b7280; padding: 15px; background-color: #f3f4f6; border-radius: 8px;">
          Bu randevu artık sizin sorumluluğunuzda değildir.
        </p>

        <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
          İyi çalışmalar,<br>
          Ravago IT Randevu Sistemi
        </p>
      </div>
    `;

    // Create iCalendar attachment for old expert (cancelled appointment)
    const icsContent = createICalendarContent(appointment, newExpert);
    const attachments = [
      {
        filename: `randevu-atama-degisti-iptal-${appointment.id || 'taslak'}.ics`,
        content: icsContent,
        contentType: 'text/calendar; method=CANCEL; charset="UTF-8"'
      }
    ];

    return await sendEmail(pool, {
      to: oldExpert.email,
      subject,
      text,
      html,
      attachments
    });
  } catch (error) {
    console.error('Error sending reassignment notification to old expert:', error);
    return false;
  }
}

/**
 * Send appointment reassignment notification to new expert
 */
async function sendReassignmentNotificationToNewExpert(pool, siteTitle, appointment, newExpert, oldExpert) {
  try {
    // If siteTitle not provided, fetch from database (backward compatibility)
    if (!siteTitle || typeof siteTitle === 'object') {
      // siteTitle is actually appointment (old signature)
      const tempAppointment = siteTitle;
      const tempNewExpert = appointment;
      const tempOldExpert = newExpert;
      appointment = tempAppointment;
      newExpert = tempNewExpert;
      oldExpert = tempOldExpert;
      siteTitle = await getSiteTitle(pool);
    }

    // Validate and parse appointment date
    if (!appointment.appointment_date) {
      console.error('Appointment date is missing');
      return false;
    }

    let appointmentDate;
    if (appointment.appointment_date instanceof Date) {
      appointmentDate = appointment.appointment_date;
    } else {
      appointmentDate = new Date(appointment.appointment_date + 'T00:00:00');
    }

    // Check if date is valid
    if (isNaN(appointmentDate.getTime())) {
      console.error('Invalid appointment date:', appointment.appointment_date);
      return false;
    }

    const formattedDate = appointmentDate.toLocaleDateString('tr-TR', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    const subject = `${siteTitle} - Yeni Randevu Ataması - ${formattedDate}`;
    const statusNote = appointment.status === 'approved' 
      ? '\n\nBu randevu zaten onaylanmış durumdadır. Randevu tarihinde hazır olmanız gerekmektedir.'
      : '\n\nRandevuyu onaylamak veya reddetmek için sisteme giriş yapabilirsiniz.';
    
    const text = `
Merhaba ${newExpert.name},

Size yeni bir randevu ataması yapılmıştır:

Randevu Detayları:
- Tarih: ${formattedDate}
- Saat: ${appointment.appointment_time.substring(0, 5)}
- Çalışan: ${appointment.user_name}
- E-posta: ${appointment.user_email}
- Telefon: ${appointment.user_phone}
- Ticket No: ${appointment.ticket_no}
- Önceki Atanan Uzman: ${oldExpert.name}
${statusNote}

İyi çalışmalar,
Ravago IT Randevu Sistemi
    `;

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #3b82f6;">Yeni Randevu Ataması</h2>
        <p>Merhaba <strong>${newExpert.name}</strong>,</p>
        <p>Size yeni bir randevu ataması yapılmıştır:</p>

        <div style="background-color: #dbeafe; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #3b82f6;">
          <h3 style="margin-top: 0; color: #1f2937;">Randevu Detayları</h3>
          <p><strong>Tarih:</strong> ${formattedDate}</p>
          <p><strong>Saat:</strong> ${appointment.appointment_time.substring(0, 5)}</p>
          <p><strong>Çalışan:</strong> ${appointment.user_name}</p>
          <p><strong>E-posta:</strong> ${appointment.user_email}</p>
          <p><strong>Telefon:</strong> ${appointment.user_phone}</p>
          <p><strong>Ticket No:</strong> ${appointment.ticket_no}</p>
          <p><strong>Önceki Atanan:</strong> ${oldExpert.name}</p>
          <p style="margin-bottom: 0;"><strong>Taşıma Sebebi:</strong> ${appointment.reassignment_reason || 'Belirtilmemiş'}</p>
        </div>

        <p style="padding: 15px; background-color: #f0f9ff; border-radius: 8px; color: #1e40af; font-size: 13px;">
          <strong>Lütfen Dikkat:</strong> Bu randevu önceden başka bir uzman tarafından alınmıştı. Taşıma sebebi yukarıda belirtilmiştir.
        </p>

        ${appointment.status === 'approved' 
          ? '<p style="padding: 15px; background-color: #fef3c7; border-radius: 8px; color: #92400e; font-size: 13px;"><strong>⚠️ Önemli:</strong> Bu randevu zaten onaylanmış durumdadır. Randevu tarihinde hazır olmanız gerekmektedir.</p>'
          : '<p>Randevuyu onaylamak veya reddetmek için sisteme giriş yapabilirsiniz. Randevuyu onayladığında, müşteriye ve önceki atanan uzmanına bildirim gönderilecektir.</p>'}

        <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
          İyi çalışmalar,<br>
          Ravago IT Randevu Sistemi
        </p>
      </div>
    `;

    // Create iCalendar attachment for new expert
    const icsContent = createICalendarContent(appointment, newExpert);
    const attachments = [
      {
        filename: `randevu-atama-degisti-yeni-${appointment.id || 'taslak'}.ics`,
        content: icsContent,
        contentType: 'text/calendar; method=REQUEST; charset="UTF-8"'
      }
    ];

    return await sendEmail(pool, {
      to: newExpert.email,
      subject,
      text,
      html,
      attachments
    });
  } catch (error) {
    console.error('Error sending reassignment notification to new expert:', error);
    return false;
  }
}

/**
 * Send appointment reassignment notification to user
 */
async function sendReassignmentNotificationToUser(pool, siteTitle, appointment, oldExpert, newExpert) {
  try {
    // If siteTitle not provided, fetch from database (backward compatibility)
    if (!siteTitle || typeof siteTitle === 'object') {
      // siteTitle is actually appointment (old signature)
      const tempAppointment = siteTitle;
      const tempOldExpert = appointment;
      const tempNewExpert = oldExpert;
      appointment = tempAppointment;
      oldExpert = tempOldExpert;
      newExpert = tempNewExpert;
      siteTitle = await getSiteTitle(pool);
    }

    // Validate and parse appointment date
    if (!appointment.appointment_date) {
      console.error('Appointment date is missing');
      return false;
    }

    let appointmentDate;
    if (appointment.appointment_date instanceof Date) {
      appointmentDate = appointment.appointment_date;
    } else {
      appointmentDate = new Date(appointment.appointment_date + 'T00:00:00');
    }

    // Check if date is valid
    if (isNaN(appointmentDate.getTime())) {
      console.error('Invalid appointment date:', appointment.appointment_date);
      return false;
    }

    const formattedDate = appointmentDate.toLocaleDateString('tr-TR', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    const subject = `${siteTitle} - Randevunuzun Atanan Uzmanı Değişti - ${formattedDate}`;
    const statusMessage = appointment.status === 'approved' 
      ? 'Randevunuz onaylanmış durumda ve yeni atanan IT Uzmanı tarafından gerçekleştirilecektir.'
      : 'Randevu talebiniz halen bekleme durumundadır. Yeni atanan uzman tarafından incelenecektir.';
    
    const text = `
Merhaba ${appointment.user_name},

Randevu talebinizin atanan IT Uzmanı değişmiştir.

Randevu Detayları:
- Tarih: ${formattedDate}
- Saat: ${appointment.appointment_time.substring(0, 5)}
- Eski Atanan Uzman: ${oldExpert.name}
- Yeni Atanan Uzman: ${newExpert.name}
- Ticket No: ${appointment.ticket_no}

${statusMessage}

Sorularınız varsa, lütfen bizimle iletişim kurunuz.

İyi günler,
Ravago IT Randevu Sistemi
    `;

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #6366f1;">Randevunuzun Atanan Uzmanı Değişti</h2>
        <p>Merhaba <strong>${appointment.user_name}</strong>,</p>
        <p>Randevu talebinizin atanan IT Uzmanı değişmiştir.</p>

        <div style="background-color: #e0e7ff; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #6366f1;">
          <h3 style="margin-top: 0; color: #1f2937;">Randevu Detayları</h3>
          <p><strong>Tarih:</strong> ${formattedDate}</p>
          <p><strong>Saat:</strong> ${appointment.appointment_time.substring(0, 5)}</p>
          <p><strong>Ticket No:</strong> ${appointment.ticket_no}</p>
          <table style="width: 100%; border-collapse: collapse; margin-top: 15px;">
            <tr>
              <td style="padding: 8px; background-color: #f3f4f6; border-right: 1px solid #d1d5db;">
                <strong style="color: #ef4444;">Eski Uzman:</strong>
              </td>
              <td style="padding: 8px; background-color: #fef2f2;">
                ${oldExpert.name}
              </td>
            </tr>
            <tr>
              <td style="padding: 8px; background-color: #f3f4f6; border-right: 1px solid #d1d5db;">
                <strong style="color: #10b981;">Yeni Uzman:</strong>
              </td>
              <td style="padding: 8px; background-color: #f0fdf4;">
                ${newExpert.name}
              </td>
            </tr>
            <tr>
              <td style="padding: 8px; background-color: #f3f4f6; border-right: 1px solid #d1d5db;">
                <strong style="color: #3b82f6;">Taşıma Sebebi:</strong>
              </td>
              <td style="padding: 8px; background-color: #eff6ff;">
                ${appointment.reassignment_reason || 'Belirtilmemiş'}
              </td>
            </tr>
          </table>
        </div>

        <p style="padding: 15px; background-color: #f0f9ff; border-radius: 8px; color: #1e40af;">
          <strong>ℹ️ Bilgi:</strong> ${appointment.status === 'approved' 
            ? 'Randevunuz onaylanmış durumda ve yeni atanan IT Uzmanı tarafından gerçekleştirilecektir.' 
            : 'Randevu talebiniz halen bekleme durumundadır. Yeni atanan uzman tarafından incelenecektir.'}
        </p>

        <p>Sorularınız varsa, lütfen bizimle iletişim kurunuz.</p>

        <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
          İyi günler,<br>
          Ravago IT Randevu Sistemi
        </p>
      </div>
    `;

    // Create iCalendar attachment for user
    const icsContent = createICalendarContent(appointment, newExpert);
    const attachments = [
      {
        filename: `randevu-atama-degisti-${appointment.id || 'taslak'}.ics`,
        content: icsContent,
        contentType: 'text/calendar; method=REQUEST; charset="UTF-8"'
      }
    ];

    return await sendEmail(pool, {
      to: appointment.user_email,
      subject,
      text,
      html,
      attachments
    });
  } catch (error) {
    console.error('Error sending reassignment notification to user:', error);
    return false;
  }
}

/**
 * Send appointment completion notification to user with survey link
 */
async function sendAppointmentCompletionToUser(pool, appointment, expert) {
  try {
    const siteTitle = await getSiteTitle(pool);

    // Validate and parse appointment date
    if (!appointment.appointment_date) {
      console.error('Appointment date is missing');
      return false;
    }

    let appointmentDate;
    if (appointment.appointment_date instanceof Date) {
      appointmentDate = appointment.appointment_date;
    } else {
      appointmentDate = new Date(appointment.appointment_date + 'T00:00:00');
    }

    // Check if date is valid
    if (isNaN(appointmentDate.getTime())) {
      console.error('Invalid appointment date:', appointment.appointment_date);
      return false;
    }

    const formattedDate = appointmentDate.toLocaleDateString('tr-TR', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    // Create survey link - in a real app, this would be a unique token
    const surveyLink = `https://randevu.devkit.com.tr/survey/${appointment.id}`;

    const subject = `${siteTitle} - Yeni Cihazınızı Teslim Aldınız`;
    const text = `
Merhaba ${appointment.user_name},

Yeni cihazınızı teslim aldığınız için teşekkür ederiz.
İyi günlerde kullanmanız dileğiyle...

Randevu Bilgileri:
- Tarih: ${formattedDate}
- Saat: ${appointment.appointment_time.substring(0, 5)}
- IT Uzmanı: ${expert.name}
- Ticket No: ${appointment.ticket_no}

Hizmetimiz hakkındaki görüşlerinizi öğrenmek için lütfen aşağıdaki anketi doldurunuz:
${surveyLink}

Anketinizi tamamladığınız için teşekkür ederiz!

İyi günler,
Ravago IT Randevu Sistemi
    `;

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #10b981;">Yeni Cihazınızı Teslim Aldınız</h2>
        <p>Merhaba <strong>${appointment.user_name}</strong>,</p>
        <p>Yeni cihazınızı teslim aldığınız için teşekkür ederiz. <strong>İyi günlerde kullanmanız dileğiyle...</strong></p>

        <div style="background-color: #d1fae5; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #10b981;">
          <h3 style="margin-top: 0; color: #1f2937;">Randevu Bilgileri</h3>
          <p><strong>Tarih:</strong> ${formattedDate}</p>
          <p><strong>Saat:</strong> ${appointment.appointment_time.substring(0, 5)}</p>
          <p><strong>IT Uzmanı:</strong> ${expert.name}</p>
          <p><strong>Ticket No:</strong> ${appointment.ticket_no}</p>
        </div>

        <div style="background-color: #f0f9ff; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #3b82f6;">
          <h3 style="margin-top: 0; color: #1e40af;">Hizmetimiz Hakkında Anket</h3>
          <p style="margin: 0 0 10px 0; color: #1f2937;">Hizmetimiz hakkındaki görüşlerinizi paylaşarak bize yardımcı olun:</p>
          <a href="${surveyLink}" style="display: inline-block; background-color: #3b82f6; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: bold; margin-top: 10px;">Ankete Katıl</a>
        </div>

        <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
          İyi günler,<br>
          Ravago IT Randevu Sistemi
        </p>
      </div>
    `;

    return await sendEmail(pool, {
      to: appointment.user_email,
      subject,
      text,
      html
    });
  } catch (error) {
    console.error('Error sending completion notification:', error);
    return false;
  }
}

/**
 * Send appointment reminder notification to user
 */
async function sendAppointmentReminderToUser(pool, appointment, expert) {
  try {
    const siteTitle = await getSiteTitle(pool);

    // Validate and parse appointment date
    if (!appointment.appointment_date) {
      console.error('Appointment date is missing');
      return false;
    }

    let appointmentDate;
    if (appointment.appointment_date instanceof Date) {
      appointmentDate = appointment.appointment_date;
    } else {
      appointmentDate = new Date(appointment.appointment_date + 'T00:00:00');
    }

    // Check if date is valid
    if (isNaN(appointmentDate.getTime())) {
      console.error('Invalid appointment date:', appointment.appointment_date);
      return false;
    }

    const formattedDate = appointmentDate.toLocaleDateString('tr-TR', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    const subject = `${siteTitle} - Randevu Hatırlatması - ${formattedDate}`;
    const text = `
Merhaba ${appointment.user_name},

Bu e-posta, randevunuzu hatırlatmak için gönderilmiştir.

Randevu Detayları:
- Tarih: ${formattedDate}
- Saat: ${appointment.appointment_time.substring(0, 5)}
- IT Uzmanı: ${expert.name}
- Ticket No: ${appointment.ticket_no}

Randevu tarihinizde hazır olmanızı rica ederiz.

ÖNEMLİ: Randevu saatinizden 5 dakika önce bulunduğunuz lokasyondaki IT ofisinde olunuz.

İyi günler,
Ravago IT Randevu Sistemi
    `;

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #3b82f6;">Randevu Hatırlatması</h2>
        <p>Merhaba <strong>${appointment.user_name}</strong>,</p>
        <p>Bu e-posta, randevunuzu hatırlatmak için gönderilmiştir.</p>

        <div style="background-color: #dbeafe; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #3b82f6;">
          <h3 style="margin-top: 0; color: #1f2937;">Randevu Detayları</h3>
          <p><strong>Tarih:</strong> ${formattedDate}</p>
          <p><strong>Saat:</strong> ${appointment.appointment_time.substring(0, 5)}</p>
          <p><strong>IT Uzmanı:</strong> ${expert.name}</p>
          <p><strong>Ticket No:</strong> ${appointment.ticket_no}</p>
        </div>

        <p>Randevu tarihinizde hazır olmanızı rica ederiz.</p>

        <div style="background-color: #fef3c7; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #f59e0b;">
          <p style="margin: 0; color: #92400e; font-size: 14px;">
            ⚠️ <strong>Önemli:</strong> Randevu saatinizden 5 dakika önce bulunduğunuz lokasyondaki IT ofisinde olunuz.
          </p>
        </div>

        <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
          İyi günler,<br>
          Ravago IT Randevu Sistemi
        </p>
      </div>
    `;

    // Create iCalendar attachment
    const icsContent = createICalendarContent(appointment, expert);
    const attachments = [
      {
        filename: `randevu-hatirlatma-${appointment.id || 'taslak'}.ics`,
        content: icsContent,
        contentType: 'text/calendar; method=REQUEST; charset="UTF-8"'
      }
    ];

    return await sendEmail(pool, {
      to: appointment.user_email,
      subject,
      text,
      html,
      attachments
    });
  } catch (error) {
    console.error('Error sending reminder notification:', error);
    return false;
  }
}

/**
 * Send reschedule request email to user
 */
async function sendRescheduleRequestEmail(pool, appointment, expert, newDate, newTime, reason, token) {
  try {
    const siteTitle = await getSiteTitle(pool);
    
    // Format dates
    let appointmentDate;
    if (appointment.appointment_date instanceof Date) {
      appointmentDate = appointment.appointment_date;
    } else {
      appointmentDate = new Date(appointment.appointment_date + 'T00:00:00');
    }

    const formattedOldDate = appointmentDate.toLocaleDateString('tr-TR', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    const newDateObj = new Date(newDate + 'T00:00:00');
    const formattedNewDate = newDateObj.toLocaleDateString('tr-TR', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    const baseUrl = process.env.FRONTEND_URL || 'https://randevu.devkit.com.tr';
    const approveUrl = `${baseUrl}/api/appointments/${appointment.id}/reschedule-approve/${token}`;
    const rejectUrl = `${baseUrl}/api/appointments/${appointment.id}/reschedule-reject/${token}`;

    const subject = `${siteTitle} - Randevu Tarih Değişikliği Talebi`;
    const text = `
Merhaba ${appointment.user_name},

IT Uzmanı ${expert.name}, randevu talebinizin tarihini değiştirmek istiyor.

Mevcut Randevu:
- Tarih: ${formattedOldDate}
- Saat: ${appointment.appointment_time.substring(0, 5)}

Önerilen Yeni Randevu:
- Tarih: ${formattedNewDate}
- Saat: ${newTime.substring(0, 5)}

Değişiklik Sebebi:
${reason}

Önerilen yeni randevu tarihini kabul etmek istiyorsanız EVET, reddetmek istiyorsanız HAYIR butonuna tıklayınız.

Onaylamak için: ${approveUrl}
Reddetmek için: ${rejectUrl}

İyi günler,
${siteTitle}
    `;

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #3b82f6;">Randevu Tarih Değişikliği Talebi</h2>
        <p>Merhaba <strong>${appointment.user_name}</strong>,</p>
        <p>IT Uzmanı <strong>${expert.name}</strong>, randevu talebinizin tarihini değiştirmek istiyor.</p>

        <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="margin-top: 0; color: #1f2937;">Mevcut Randevu</h3>
          <p><strong>Tarih:</strong> ${formattedOldDate}</p>
          <p><strong>Saat:</strong> ${appointment.appointment_time.substring(0, 5)}</p>
        </div>

        <div style="background-color: #dbeafe; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #3b82f6;">
          <h3 style="margin-top: 0; color: #1f2937;">Önerilen Yeni Randevu</h3>
          <p><strong>Tarih:</strong> ${formattedNewDate}</p>
          <p><strong>Saat:</strong> ${newTime.substring(0, 5)}</p>
        </div>

        <div style="background-color: #fef3c7; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #f59e0b;">
          <p style="margin: 0; color: #92400e;"><strong>Değişiklik Sebebi:</strong></p>
          <p style="margin: 10px 0 0 0; color: #92400e;">${reason.replace(/\n/g, '<br>')}</p>
        </div>

        <p style="font-size: 16px; font-weight: bold; color: #1f2937; margin: 30px 0 20px 0;">
          Önerilen yeni randevu tarihini kabul etmek istiyorsanız <strong>EVET</strong>, reddetmek istiyorsanız <strong>HAYIR</strong> butonuna tıklayınız.
        </p>

        <div style="text-align: center; margin: 30px 0;">
          <a href="${approveUrl}" style="display: inline-block; background-color: #10b981; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold; margin-right: 10px;">
            ✓ EVET - Kabul Et
          </a>
          <a href="${rejectUrl}" style="display: inline-block; background-color: #ef4444; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold;">
            ✕ HAYIR - Reddet
          </a>
        </div>

        <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
          İyi günler,<br>
          ${siteTitle}
        </p>
      </div>
    `;

    return await sendEmail(pool, {
      to: appointment.user_email,
      subject,
      text,
      html
    });
  } catch (error) {
    console.error('Error sending reschedule request email:', error);
    return false;
  }
}

/**
 * Send reschedule confirmation email to user
 */
async function sendRescheduleConfirmationEmail(pool, appointment, expert, oldDate, oldTime) {
  try {
    const siteTitle = await getSiteTitle(pool);
    
    // Format dates
    let appointmentDate;
    if (appointment.appointment_date instanceof Date) {
      appointmentDate = appointment.appointment_date;
    } else {
      appointmentDate = new Date(appointment.appointment_date + 'T00:00:00');
    }

    const formattedDate = appointmentDate.toLocaleDateString('tr-TR', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    const subject = `${siteTitle} - Randevu Tarihiniz Güncellendi - ${formattedDate}`;
    const text = `
Merhaba ${appointment.user_name},

Randevu tarihiniz başarıyla güncellendi.

Yeni Randevu Detayları:
- Tarih: ${formattedDate}
- Saat: ${appointment.appointment_time.substring(0, 5)}
- IT Uzmanı: ${expert.name}
- Ticket No: ${appointment.ticket_no}

Randevu tarihinizde hazır olmanızı rica ederiz.

ÖNEMLİ: Randevu saatinizden 5 dakika önce bulunduğunuz lokasyondaki IT ofisinde olunuz.

İyi günler,
${siteTitle}
    `;

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #10b981;">Randevu Tarihiniz Güncellendi</h2>
        <p>Merhaba <strong>${appointment.user_name}</strong>,</p>
        <p>Randevu tarihiniz başarıyla güncellendi.</p>

        <div style="background-color: #d1fae5; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #10b981;">
          <h3 style="margin-top: 0; color: #1f2937;">Yeni Randevu Detayları</h3>
          <p><strong>Tarih:</strong> ${formattedDate}</p>
          <p><strong>Saat:</strong> ${appointment.appointment_time.substring(0, 5)}</p>
          <p><strong>IT Uzmanı:</strong> ${expert.name}</p>
          <p><strong>Ticket No:</strong> ${appointment.ticket_no}</p>
        </div>

        <p>Randevu tarihinizde hazır olmanızı rica ederiz.</p>

        <div style="background-color: #fef3c7; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #f59e0b;">
          <p style="margin: 0; color: #92400e; font-size: 14px;">
            ⚠️ <strong>Önemli:</strong> Randevu saatinizden 5 dakika önce bulunduğunuz lokasyondaki IT ofisinde olunuz.
          </p>
        </div>

        <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
          İyi günler,<br>
          ${siteTitle}
        </p>
      </div>
    `;

    const icsContent = createICalendarContent(appointment, expert);
    const attachments = [
      {
        filename: `randevu-guncelleme-${appointment.id || 'taslak'}.ics`,
        content: icsContent,
        contentType: 'text/calendar; method=REQUEST; charset="UTF-8"'
      }
    ];

    return await sendEmail(pool, {
      to: appointment.user_email,
      subject,
      text,
      html,
      attachments
    });
  } catch (error) {
    console.error('Error sending reschedule confirmation email:', error);
    return false;
  }
}

/**
 * Send reschedule rejection email to user
 */
async function sendRescheduleRejectionEmail(pool, appointment, expert, newDate, newTime, reason) {
  try {
    const siteTitle = await getSiteTitle(pool);
    
    // Format dates
    let appointmentDate;
    if (appointment.appointment_date instanceof Date) {
      appointmentDate = appointment.appointment_date;
    } else {
      appointmentDate = new Date(appointment.appointment_date + 'T00:00:00');
    }

    const formattedCurrentDate = appointmentDate.toLocaleDateString('tr-TR', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    const newDateObj = new Date(newDate + 'T00:00:00');
    const formattedNewDate = newDateObj.toLocaleDateString('tr-TR', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    const subject = `${siteTitle} - Randevu Tarih Değişikliği Reddedildi`;
    const text = `
Merhaba ${appointment.user_name},

Tarih değişikliği talebiniz reddedildi. Mevcut randevu tarihiniz aynı kalacaktır.

Mevcut Randevu Detayları:
- Tarih: ${formattedCurrentDate}
- Saat: ${appointment.appointment_time.substring(0, 5)}
- IT Uzmanı: ${expert.name}
- Ticket No: ${appointment.ticket_no}

Önerilen Yeni Tarih (Reddedildi):
- Tarih: ${formattedNewDate}
- Saat: ${newTime.substring(0, 5)}

Randevu tarihinizde hazır olmanızı rica ederiz.

ÖNEMLİ: Randevu saatinizden 5 dakika önce bulunduğunuz lokasyondaki IT ofisinde olunuz.

İyi günler,
${siteTitle}
    `;

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #ef4444;">Randevu Tarih Değişikliği Reddedildi</h2>
        <p>Merhaba <strong>${appointment.user_name}</strong>,</p>
        <p>Tarih değişikliği talebiniz reddedildi. Mevcut randevu tarihiniz aynı kalacaktır.</p>

        <div style="background-color: #d1fae5; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #10b981;">
          <h3 style="margin-top: 0; color: #1f2937;">Mevcut Randevu Detayları</h3>
          <p><strong>Tarih:</strong> ${formattedCurrentDate}</p>
          <p><strong>Saat:</strong> ${appointment.appointment_time.substring(0, 5)}</p>
          <p><strong>IT Uzmanı:</strong> ${expert.name}</p>
          <p><strong>Ticket No:</strong> ${appointment.ticket_no}</p>
        </div>

        <div style="background-color: #fee2e2; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ef4444;">
          <h3 style="margin-top: 0; color: #1f2937;">Önerilen Yeni Tarih (Reddedildi)</h3>
          <p><strong>Tarih:</strong> ${formattedNewDate}</p>
          <p><strong>Saat:</strong> ${newTime.substring(0, 5)}</p>
        </div>

        <p>Randevu tarihinizde hazır olmanızı rica ederiz.</p>

        <div style="background-color: #fef3c7; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #f59e0b;">
          <p style="margin: 0; color: #92400e; font-size: 14px;">
            ⚠️ <strong>Önemli:</strong> Randevu saatinizden 5 dakika önce bulunduğunuz lokasyondaki IT ofisinde olunuz.
          </p>
        </div>

        <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
          İyi günler,<br>
          ${siteTitle}
        </p>
      </div>
    `;

    return await sendEmail(pool, {
      to: appointment.user_email,
      subject,
      text,
      html
    });
  } catch (error) {
    console.error('Error sending reschedule rejection email:', error);
    return false;
  }
}

module.exports = {
  sendEmail,
  getSiteTitle,
  sendAppointmentNotificationToExpert,
  sendAppointmentApprovalToUser,
  sendAppointmentApprovalToExpert,
  sendAppointmentCancellationToUser,
  sendReassignmentNotificationToOldExpert,
  sendReassignmentNotificationToNewExpert,
  sendReassignmentNotificationToUser,
  sendAppointmentCompletionToUser,
  sendAppointmentReminderToUser,
  sendRescheduleRequestEmail,
  sendRescheduleConfirmationEmail,
  sendRescheduleRejectionEmail
};





