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
PRODID:-//IT Randevu//IT Randevu Sistemi//EN
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
async function sendAppointmentNotificationToExpert(pool, appointment, expert) {
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

  const subject = `Yeni Randevu Talebi - ${formattedDate}`;
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
        <p><strong>Çalışan:</strong> ${appointment.user_name}</p>
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

      <div style="background-color: #f0f9ff; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #3b82f6;">
        <p style="margin: 0; color: #1e40af; font-size: 13px;">
          💡 <strong>İpucu:</strong> E-postaya eklenen takvim dosyasını (.ics) indirerek Outlook, Google Calendar veya diğer takvim uygulamalarınıza ekleyebilirsiniz.
        </p>
      </div>

      <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
        İyi günler,<br>
        IT Randevu Sistemi
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
async function sendAppointmentApprovalToExpert(pool, appointment, expert) {
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

  const subject = `Randevuyu Onayladınız - ${formattedDate}`;
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
IT Randevu Sistemi
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
        IT Randevu Sistemi
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
async function sendAppointmentCancellationToUser(pool, appointment, expert, cancellationReason) {
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

/**
 * Send appointment reassignment notification to old expert
 */
async function sendReassignmentNotificationToOldExpert(pool, appointment, oldExpert, newExpert) {
  try {
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

    const subject = `Randevu Ataması Değiştirildi - ${formattedDate}`;
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
IT Randevu Sistemi
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
          IT Randevu Sistemi
        </p>
      </div>
    `;

    return await sendEmail(pool, {
      to: oldExpert.email,
      subject,
      text,
      html
    });
  } catch (error) {
    console.error('Error sending reassignment notification to old expert:', error);
    return false;
  }
}

/**
 * Send appointment reassignment notification to new expert
 */
async function sendReassignmentNotificationToNewExpert(pool, appointment, newExpert, oldExpert) {
  try {
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

    const subject = `Yeni Randevu Ataması - ${formattedDate}`;
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

Randevuyu onaylamak veya reddetmek için sisteme giriş yapabilirsiniz.

İyi çalışmalar,
IT Randevu Sistemi
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

        <p>Randevuyu onaylamak veya reddetmek için sisteme giriş yapabilirsiniz. Randevuyu onayladığında, müşteriye ve önceki atanan uzmanına bildirim gönderilecektir.</p>

        <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
          İyi çalışmalar,<br>
          IT Randevu Sistemi
        </p>
      </div>
    `;

    return await sendEmail(pool, {
      to: newExpert.email,
      subject,
      text,
      html
    });
  } catch (error) {
    console.error('Error sending reassignment notification to new expert:', error);
    return false;
  }
}

/**
 * Send appointment reassignment notification to user
 */
async function sendReassignmentNotificationToUser(pool, appointment, oldExpert, newExpert) {
  try {
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

    const subject = `Randevunuzun Atanan Uzmanı Değişti - ${formattedDate}`;
    const text = `
Merhaba ${appointment.user_name},

Randevu talebinizin atanan IT Uzmanı değişmiştir.

Randevu Detayları:
- Tarih: ${formattedDate}
- Saat: ${appointment.appointment_time.substring(0, 5)}
- Eski Atanan Uzman: ${oldExpert.name}
- Yeni Atanan Uzman: ${newExpert.name}
- Ticket No: ${appointment.ticket_no}

Randevu talebiniz halen bekleme durumundadır. Yeni atanan uzman tarafından incelenecektir.

Sorularınız varsa, lütfen bizimle iletişim kurunuz.

İyi günler,
IT Randevu Sistemi
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
          <strong>ℹ️ Bilgi:</strong> Randevu talebiniz halen bekleme durumundadır. Yeni atanan uzman tarafından incelenecektir.
        </p>

        <p>Sorularınız varsa, lütfen bizimle iletişim kurunuz.</p>

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
  } catch (error) {
    console.error('Error sending reassignment notification to user:', error);
    return false;
  }
}

module.exports = {
  sendEmail,
  sendAppointmentNotificationToExpert,
  sendAppointmentApprovalToUser,
  sendAppointmentApprovalToExpert,
  sendAppointmentCancellationToUser,
  sendReassignmentNotificationToOldExpert,
  sendReassignmentNotificationToNewExpert,
  sendReassignmentNotificationToUser
};




