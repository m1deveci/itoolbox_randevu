import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface AppointmentNotification {
  type: 'new' | 'approved' | 'rejected';
  expertEmail: string;
  expertName: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  appointmentDate: string;
  appointmentTime: string;
  location: string;
  notes?: string;
  adminNotes?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const data: AppointmentNotification = await req.json();

    let subject = '';
    let body = '';

    if (data.type === 'new') {
      subject = `Yeni Randevu Talebi - ${data.customerName}`;
      body = `
Merhaba ${data.expertName},

Yeni bir randevu talebi aldınız:

Müşteri Bilgileri:
- Ad Soyad: ${data.customerName}
- E-posta: ${data.customerEmail}
- Telefon: ${data.customerPhone}

Randevu Detayları:
- Tarih: ${data.appointmentDate}
- Saat: ${data.appointmentTime}
- Lokasyon: ${data.location}
- Hizmet: Telefon Değişimi
${data.notes ? `- Müşteri Notu: ${data.notes}` : ''}

Randevuyu onaylamak veya reddetmek için admin paneline giriş yapınız.

İyi çalışmalar.
      `;
    } else if (data.type === 'approved') {
      subject = `Randevunuz Onaylandı`;
      body = `
Sayın ${data.customerName},

${data.appointmentDate} tarihli, saat ${data.appointmentTime} randevunuz ${data.expertName} tarafından onaylanmıştır.

Randevu Detayları:
- IT Uzmanı: ${data.expertName}
- Tarih: ${data.appointmentDate}
- Saat: ${data.appointmentTime}
- Lokasyon: ${data.location}
- Hizmet: Telefon Değişimi
${data.adminNotes ? `\n${data.expertName} Notu:\n${data.adminNotes}` : ''}

Randevunuza geç kalmamaya dikkat ediniz.

İyi günler dileriz.
      `;
    } else if (data.type === 'rejected') {
      subject = `Randevunuz Reddedildi`;
      body = `
Sayın ${data.customerName},

Üzgünüz, ${data.appointmentDate} tarihli, saat ${data.appointmentTime} randevunuz reddedilmiştir.

${data.adminNotes ? `Red Nedeni:\n${data.adminNotes}\n\n` : ''}
Farklı bir tarih ve saat için yeni randevu oluşturabilirsiniz.

İyi günler dileriz.
      `;
    }

    console.log('Email notification:', { type: data.type, to: data.type === 'new' ? data.expertEmail : data.customerEmail, subject });

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Email notification logged (email service not configured)',
        emailData: {
          to: data.type === 'new' ? data.expertEmail : data.customerEmail,
          subject,
          body,
        },
      }),
      {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  } catch (error) {
    console.error('Error processing notification:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  }
});
