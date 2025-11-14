import React, { useState, useEffect } from 'react';
import { CheckCircle, XCircle, Clock, Trash2, Edit, Download, Calendar } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import Swal from 'sweetalert2';
import * as XLSX from 'xlsx';

interface Appointment {
  id: string;
  userName: string;
  userEmail: string;
  userPhone: string;
  ticketNo?: string;
  expertName: string;
  expertId: number;
  date: string;
  time: string;
  status: 'pending' | 'approved' | 'cancelled' | 'completed';
}

interface Expert {
  id: number;
  name: string;
  email: string;
}

interface AdminUser {
  id: number; // Same ID as expert_id in randevu database
  name: string;
  email: string;
  role: string;
}

interface Props {
  adminUser: AdminUser | null;
}

export function AppointmentManagement({ adminUser }: Props) {
  const [searchParams] = useSearchParams();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [experts, setExperts] = useState<Expert[]>([]);
  const [superadminExperts, setSuperadminExperts] = useState<Expert[]>([]);
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'cancelled' | 'my' | 'completed'>('my');
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [selectedAppointmentForStatus, setSelectedAppointmentForStatus] = useState<Appointment | null>(null);
  const [showPhoneInfoModal, setShowPhoneInfoModal] = useState(false);
  const [selectedAppointmentForPhone, setSelectedAppointmentForPhone] = useState<Appointment | null>(null);
  const [phoneInfo, setPhoneInfo] = useState<{ phones: Array<{ inventory_number: string; brand: string; model: string; imei1: string }>; userEmail: string; userId: number; message?: string } | null>(null);
  const [loadingPhoneInfo, setLoadingPhoneInfo] = useState(false);
  const [showRescheduleModal, setShowRescheduleModal] = useState(false);
  const [selectedAppointmentForReschedule, setSelectedAppointmentForReschedule] = useState<Appointment | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [rescheduleTime, setRescheduleTime] = useState('');
  const [rescheduleReason, setRescheduleReason] = useState('');
  const [availableTimes, setAvailableTimes] = useState<string[]>([]);
  const [loadingReschedule, setLoadingReschedule] = useState(false);

  // Load experts on mount
  useEffect(() => {
    loadExperts();
    loadSuperadminExperts();
  }, []);

  // Check URL params for initial filter
  useEffect(() => {
    const urlFilter = searchParams.get('filter');
    if (urlFilter && ['all', 'pending', 'approved', 'cancelled', 'my', 'completed'].includes(urlFilter)) {
      setFilter(urlFilter as 'all' | 'pending' | 'approved' | 'cancelled' | 'my' | 'completed');
    }
  }, [searchParams]);

  useEffect(() => {
    loadAppointments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, adminUser, searchParams]);

  const loadExperts = async () => {
    try {
      const response = await fetch('/api/experts');
      if (!response.ok) throw new Error('Failed to fetch experts');
      const data = await response.json();
      setExperts(data);
    } catch (error) {
      console.error('Error loading experts:', error);
    }
  };

  const loadSuperadminExperts = async () => {
    try {
      const response = await fetch('/api/experts?role=superadmin');
      if (!response.ok) throw new Error('Failed to fetch superadmin experts');
      const data = await response.json();
      setSuperadminExperts(data);
    } catch (error) {
      console.error('Error loading superadmin experts:', error);
    }
  };

  const loadAppointments = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      
      // adminUser.id is the same as expert_id in randevu database
      const expertId = adminUser?.id;
      const isSuperadmin = adminUser?.role === 'superadmin';
      
      // Check if expertId is provided in URL params (e.g., from notification click)
      const urlExpertId = searchParams.get('expertId');
      const expertIdToUse = urlExpertId ? parseInt(urlExpertId) : expertId;
      
      // If filter is 'my', show only current user's appointments
      if (filter === 'my' && adminUser && expertId) {
        params.append('expertId', expertId.toString());
      } else if (filter !== 'all' && filter !== 'my') {
        params.append('status', filter);
        // If expertId is in URL params, use it (e.g., from notification click)
        if (urlExpertId && expertIdToUse) {
          params.append('expertId', expertIdToUse.toString());
        }
      }
      
      // If user is not superadmin, always filter by their expertId (security)
      // Superadmin can see all appointments when filter='all'
      // But if expertId is in URL params, use it (e.g., from notification click)
      if (urlExpertId && expertIdToUse) {
        // URL'den gelen expertId zaten yukarıda eklenmiş olabilir, tekrar eklemeyelim
        if (filter === 'all' || filter === 'my') {
          params.append('expertId', expertIdToUse.toString());
        }
      } else if (!isSuperadmin && expertId) {
        params.append('expertId', expertId.toString());
      }

      const response = await fetch(`/api/appointments?${params.toString()}&limit=1000`);
      if (!response.ok) throw new Error('Failed to fetch appointments');
      const data = await response.json();
      
      // Debug: Log received appointments
      console.log('=== Appointment Loading Debug ===');
      console.log('Filter:', filter);
      console.log('Is Superadmin:', isSuperadmin);
      console.log('Current Expert ID:', expertId);
      console.log('Admin User:', { id: adminUser?.id, name: adminUser?.name, role: adminUser?.role });
      console.log('API Params:', params.toString());
      console.log('Loaded appointments:', data.appointments?.length || 0, 'total');
      console.log('Appointment IDs:', data.appointments?.map((a: any) => ({ id: a.id, expert_id: a.expert_id, user_name: a.user_name, status: a.status })));
      console.log('================================');

      let mappedAppointments = data.appointments.map((a: {
        id: number;
        user_name: string;
        user_email: string;
        user_phone: string;
        ticket_no?: string;
        expert_name: string;
        expert_id: number;
        date: string;
        time: string;
        status: string;
      }) => ({
        id: a.id.toString(),
        userName: a.user_name,
        userEmail: a.user_email,
        userPhone: a.user_phone,
        ticketNo: a.ticket_no,
        expertName: a.expert_name,
        expertId: a.expert_id,
        date: a.date.split('T')[0],
        time: a.time.substring(0, 5),
        status: a.status as 'pending' | 'approved' | 'cancelled' | 'completed'
      }));

      // If filter is 'my', filter by expert ID client-side as well
      // Benim randevularım tabında tamamlanan randevular gözükmemeli
      if (filter === 'my' && adminUser) {
        mappedAppointments = mappedAppointments.filter((a: Appointment) => a.expertId === adminUser.id && a.status !== 'completed');
      }
      
      // If expertId is in URL params (e.g., from notification click), filter by it
      if (urlExpertId && expertIdToUse && filter === 'pending') {
        mappedAppointments = mappedAppointments.filter((a: Appointment) => a.expertId === expertIdToUse);
      }

      setAppointments(mappedAppointments);
    } catch (error) {
      console.error('Error loading appointments:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (id: string) => {
    try {
      const response = await fetch(`/api/appointments/${id}/approve`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': adminUser?.id?.toString() || '',
          'x-user-name': encodeURIComponent(adminUser?.name || 'System')
        }
      });

      if (!response.ok) throw new Error('Failed to approve appointment');
      setAppointments(appointments.map(a => a.id === id ? { ...a, status: 'approved' } : a));
    } catch (error) {
      console.error('Error approving appointment:', error);
      alert('Randevu onaylanırken hata oluştu');
    }
  };

  const handleCancel = async (id: string) => {
    const { value: cancellationReason } = await Swal.fire({
      title: 'Randevuyu İptal Et',
      text: 'İptal sebebini giriniz:',
      input: 'textarea',
      inputPlaceholder: 'İptal sebebini buraya yazın...',
      inputAttributes: {
        'aria-label': 'İptal sebebi'
      },
      showCancelButton: true,
      confirmButtonText: 'İptal Et',
      cancelButtonText: 'Vazgeç',
      confirmButtonColor: '#ef4444',
      inputValidator: (value) => {
        if (!value || value.trim().length === 0) {
          return 'İptal sebebi gereklidir!';
        }
        if (value.trim().length < 5) {
          return 'İptal sebebi en az 5 karakter olmalıdır!';
        }
      }
    });

    if (!cancellationReason) {
      return;
    }

    try {
      const response = await fetch(`/api/appointments/${id}/cancel`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': adminUser?.id?.toString() || '',
          'x-user-name': encodeURIComponent(adminUser?.name || 'System')
        },
        body: JSON.stringify({ cancellationReason: cancellationReason.trim() })
      });

      if (!response.ok) throw new Error('Failed to cancel appointment');

      await Swal.fire({
        icon: 'success',
        title: 'Randevu İptal Edildi',
        text: 'Randevu başarıyla iptal edildi.',
        confirmButtonColor: '#3b82f6'
      });

      setAppointments(appointments.map(a => a.id === id ? { ...a, status: 'cancelled' } : a));
    } catch (error) {
      console.error('Error cancelling appointment:', error);
      await Swal.fire({
        icon: 'error',
        title: 'Hata',
        text: 'Randevu iptal edilirken hata oluştu',
        confirmButtonColor: '#ef4444'
      });
    }
  };

  const handleDelete = async (id: string) => {
    const confirmed = await Swal.fire({
      title: 'Randevuyu Sil',
      text: 'Bu randevuyu silmek istediğinizden emin misiniz? Bu işlem geri alınamaz.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Evet, Sil',
      cancelButtonText: 'Vazgeç',
      confirmButtonColor: '#ef4444'
    });

    if (!confirmed.isConfirmed) {
      return;
    }

    try {
      const response = await fetch(`/api/appointments/${id}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': adminUser?.id?.toString() || '',
          'x-user-name': encodeURIComponent(adminUser?.name || 'System')
        }
      });

      if (!response.ok) throw new Error('Failed to delete appointment');

      await Swal.fire({
        icon: 'success',
        title: 'Randevu Silindi',
        text: 'Randevu başarıyla silindi.',
        confirmButtonColor: '#3b82f6'
      });

      setAppointments(appointments.filter(a => a.id !== id));
    } catch (error) {
      console.error('Error deleting appointment:', error);
      await Swal.fire({
        icon: 'error',
        title: 'Hata',
        text: 'Randevu silinirken hata oluştu',
        confirmButtonColor: '#ef4444'
      });
    }
  };

  const handleRemindAppointment = async (id: string) => {
    try {
      const response = await fetch(`/api/appointments/${id}/remind`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      if (!response.ok) throw new Error('Failed to send reminder');

      await Swal.fire({
        icon: 'success',
        title: 'Hatırlama E-postası Gönderildi',
        text: 'Çalışana hatırlama e-postası başarıyla gönderildi.',
        confirmButtonColor: '#3b82f6'
      });
    } catch (error) {
      console.error('Error sending reminder:', error);
      await Swal.fire({
        icon: 'error',
        title: 'Hata',
        text: 'Hatırlama e-postası gönderilirken hata oluştu',
        confirmButtonColor: '#ef4444'
      });
    }
  };

  const handleReschedule = async (appointment: Appointment) => {
    setSelectedAppointmentForReschedule(appointment);
    setRescheduleDate('');
    setRescheduleTime('');
    setRescheduleReason('');
    setAvailableTimes([]);
    setShowRescheduleModal(true);
  };

  const loadAvailableTimesForDate = async (expertId: number, date: string) => {
    try {
      const response = await fetch(`/api/availability?expertId=${expertId}`);
      if (!response.ok) throw new Error('Failed to fetch availability');
      const data = await response.json();

      // Calculate next date (1 day after) to handle timezone offset
      const dateObj = new Date(date + 'T00:00:00');
      dateObj.setDate(dateObj.getDate() + 1);
      const year = dateObj.getFullYear();
      const month = String(dateObj.getMonth() + 1).padStart(2, '0');
      const day = String(dateObj.getDate()).padStart(2, '0');
      const nextDate = `${year}-${month}-${day}`;

      // Filter availabilities for this date
      const dayAvailabilities = data.filter((a: any) => {
        let dateString = a.availability_date;
        if (typeof dateString === 'string') {
          if (dateString.includes(' ')) {
            dateString = dateString.split(' ')[0];
          } else if (dateString.includes('T')) {
            dateString = dateString.split('T')[0];
          }
        }
        return dateString === date || dateString === nextDate;
      });

      // Get available time slots
      const times: string[] = [];
      dayAvailabilities.forEach((avail: any) => {
        const startTime = avail.start_time ? avail.start_time.substring(0, 5) : '';
        if (startTime && !times.includes(startTime)) {
          times.push(startTime);
        }
      });

      // Check for existing appointments
      const apptResponse = await fetch(`/api/appointments?expertId=${expertId}&date=${date}`);
      if (apptResponse.ok) {
        const apptData = await apptResponse.json();
        const bookedTimes = (apptData.appointments || [])
          .filter((apt: any) => apt.status !== 'cancelled' && apt.id !== selectedAppointmentForReschedule?.id)
          .map((apt: any) => apt.time.substring(0, 5));

        setAvailableTimes(times.filter(t => !bookedTimes.includes(t)).sort());
      } else {
        setAvailableTimes(times.sort());
      }
    } catch (error) {
      console.error('Error loading available times:', error);
      setAvailableTimes([]);
    }
  };

  const handleRescheduleDateChange = (date: string) => {
    setRescheduleDate(date);
    setRescheduleTime('');
    if (selectedAppointmentForReschedule && date) {
      loadAvailableTimesForDate(selectedAppointmentForReschedule.expertId, date);
    }
  };

  const handleSubmitReschedule = async () => {
    if (!selectedAppointmentForReschedule) return;

    if (!rescheduleDate || !rescheduleTime || !rescheduleReason.trim()) {
      await Swal.fire({
        icon: 'warning',
        title: 'Eksik Bilgi',
        text: 'Lütfen yeni tarih, saat ve değişiklik sebebini giriniz',
        confirmButtonColor: '#3b82f6'
      });
      return;
    }

    if (rescheduleReason.trim().length < 10) {
      await Swal.fire({
        icon: 'warning',
        title: 'Geçersiz Sebep',
        text: 'Değişiklik sebebi en az 10 karakter olmalıdır',
        confirmButtonColor: '#3b82f6'
      });
      return;
    }

    setLoadingReschedule(true);
    try {
      const response = await fetch(`/api/appointments/${selectedAppointmentForReschedule.id}/reschedule`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': adminUser?.id?.toString() || '',
          'x-user-name': encodeURIComponent(adminUser?.name || 'System')
        },
        body: JSON.stringify({
          newDate: rescheduleDate,
          newTime: rescheduleTime,
          reason: rescheduleReason.trim()
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Tarih değişikliği talebi oluşturulamadı');
      }

      await Swal.fire({
        icon: 'success',
        title: 'Talebi Gönderildi',
        text: 'Tarih değişikliği talebi kullanıcıya e-posta ile gönderildi. Kullanıcının onayını bekliyoruz.',
        confirmButtonColor: '#3b82f6'
      });

      setShowRescheduleModal(false);
      setRescheduleDate('');
      setRescheduleTime('');
      setRescheduleReason('');
      setAvailableTimes([]);
      loadAppointments();
    } catch (error) {
      console.error('Error submitting reschedule:', error);
      await Swal.fire({
        icon: 'error',
        title: 'Hata',
        text: error instanceof Error ? error.message : 'Tarih değişikliği talebi oluşturulurken hata oluştu',
        confirmButtonColor: '#ef4444'
      });
    } finally {
      setLoadingReschedule(false);
    }
  };

  const changeStatusDirect = async (appointmentId: string, newStatus: string) => {
    let cancellationReason = '';

    // If changing to cancelled, ask for reason
    if (newStatus === 'cancelled') {
      const { value: reason } = await Swal.fire({
        title: 'İptal Sebebi',
        text: 'Çalışan gelmediği için mi iptal ediliyor?',
        input: 'textarea',
        inputPlaceholder: 'İptal sebebi (ör: Çalışan gelmedi)',
        inputValue: 'Çalışan gelmedi',
        showCancelButton: true,
        confirmButtonText: 'İptal Et',
        confirmButtonColor: '#ef4444',
        cancelButtonText: 'Vazgeç'
      });

      if (!reason) {
        return;
      }
      cancellationReason = reason;
    }

    try {
      const response = await fetch(`/api/appointments/${appointmentId}/change-status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': adminUser?.id?.toString() || '',
          'x-user-name': encodeURIComponent(adminUser?.name || 'System')
        },
        body: JSON.stringify({
          status: newStatus,
          cancellationReason
        })
      });

      if (!response.ok) throw new Error('Failed to change status');

      // Update local state
      setAppointments(appointments.map(a =>
        a.id === appointmentId ? { ...a, status: newStatus as any } : a
      ));

      await Swal.fire({
        icon: 'success',
        title: 'Durum Değiştirildi',
        text: `Randevu durumu başarıyla "${newStatus === 'completed' ? 'Tamamlandı' : 'İptal Edildi'}" olarak değiştirildi.`,
        confirmButtonColor: '#3b82f6'
      });
    } catch (error) {
      console.error('Error changing status:', error);
      await Swal.fire({
        icon: 'error',
        title: 'Hata',
        text: 'Durum değiştirilirken hata oluştu',
        confirmButtonColor: '#ef4444'
      });
    }
  };

  const handleChangeStatus = async (newStatus: string) => {
    if (!selectedAppointmentForStatus) return;
    await changeStatusDirect(selectedAppointmentForStatus.id, newStatus);
    setShowStatusModal(false);
  };

  const handlePhoneInfoClick = async (appointment: Appointment) => {
    // Sadece "Benim randevularım" tabında çalışsın
    if (filter !== 'my') return;

    setSelectedAppointmentForPhone(appointment);
    setShowPhoneInfoModal(true);
    setLoadingPhoneInfo(true);
    setPhoneInfo(null);

    try {
      const response = await fetch(`/api/appointments/${appointment.id}/phone-info`);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Telefon bilgileri alınamadı' }));
        throw new Error(errorData.error || 'Telefon bilgileri alınamadı');
      }
      const data = await response.json();
      setPhoneInfo(data);
    } catch (error) {
      console.error('Error fetching phone info:', error);
      setPhoneInfo({ phones: [], message: error instanceof Error ? error.message : 'Telefon bilgileri alınırken hata oluştu' });
    } finally {
      setLoadingPhoneInfo(false);
    }
  };

  const checkExpertAvailability = async (
    expertId: number,
    appointmentDate: string,
    appointmentTime: string
  ): Promise<boolean> => {
    try {
      const response = await fetch(
        `/api/availability?expertId=${expertId}&date=${appointmentDate}&time=${appointmentTime}`
      );
      if (!response.ok) return false;
      const data = await response.json();
      return data.isAvailable === true;
    } catch (error) {
      console.error('Error checking availability:', error);
      return false;
    }
  };

  const handleReassign = async (appointmentId: string) => {
    const appointment = appointments.find(a => a.id === appointmentId);
    if (!appointment) return;

    // Check availability for each superadmin expert
    const availabilityStatus: { [key: number]: boolean } = {};
    for (const expert of superadminExperts) {
      if (expert.id !== appointment.expertId) {
        const isAvailable = await checkExpertAvailability(
          expert.id,
          appointment.date,
          appointment.time
        );
        availabilityStatus[expert.id] = isAvailable;
      }
    }

    // Create HTML with expert options
    const htmlContent = superadminExperts
      .filter(e => e.id !== appointment.expertId) // Exclude current expert
      .map(
        expert =>
          `<div style="margin: 8px 0; padding: 8px; border: 1px solid #e5e7eb; border-radius: 4px; text-align: left;">
          <label style="display: flex; align-items: center; cursor: ${
            availabilityStatus[expert.id] ? 'pointer' : 'not-allowed'
          };">
            <input type="radio" name="newExpert" value="${expert.id}" ${
            !availabilityStatus[expert.id] ? 'disabled' : ''
          } style="margin-right: 8px;" />
            <span style="flex: 1;">
              <strong>${expert.name}</strong>
              ${availabilityStatus[expert.id] ? '✅ Müsait' : '❌ Müsait Değil'}
            </span>
          </label>
        </div>`
      )
      .join('');

    const { value: selectedExpertId } = await Swal.fire({
      title: 'Atama Değiştir',
      html: `
        <div style="text-align: left; margin: 16px 0;">
          <p><strong>Şu anki uzman:</strong> ${appointment.expertName}</p>
          <p style="margin-bottom: 16px;"><strong>Tarih/Saat:</strong> ${appointment.date} ${appointment.time}</p>
          <p style="margin-bottom: 8px;"><strong>Yeni uzman seçin (Superadminler):</strong></p>
          ${htmlContent}
        </div>
      `,
      input: 'radio',
      inputOptions: superadminExperts
        .filter(e => e.id !== appointment.expertId)
        .reduce(
          (acc, expert) => {
            const status = availabilityStatus[expert.id]
              ? '✅ Müsait'
              : '❌ Müsait Değil';
            acc[expert.id.toString()] = `${expert.name} ${status}`;
            return acc;
          },
          {} as { [key: string]: string }
        ),
      showCancelButton: true,
      confirmButtonText: 'Atamayı Değiştir',
      cancelButtonText: 'Vazgeç',
      confirmButtonColor: '#3b82f6',
      inputValidator: (value) => {
        if (!value) {
          return 'Lütfen yeni bir superadmin seçiniz!';
        }
        const selectedId = parseInt(value);
        if (!availabilityStatus[selectedId]) {
          return 'Seçilen superadmin bu tarih/saatte müsait değildir!';
        }
      }
    });

    if (!selectedExpertId) {
      return;
    }

    // Ask for reassignment reason
    const { value: reassignmentReason } = await Swal.fire({
      title: 'Atama Değişikliği Sebebi',
      input: 'textarea',
      inputPlaceholder: 'Atama değişikliğinin nedenini yazın...',
      inputAttributes: {
        'aria-label': 'Atama değişikliği sebebi'
      },
      showCancelButton: true,
      confirmButtonText: 'Devam Et',
      cancelButtonText: 'Vazgeç',
      confirmButtonColor: '#3b82f6',
      inputValidator: (value) => {
        if (!value || value.trim().length === 0) {
          return 'Lütfen atama değişikliğinin sebebini giriniz!';
        }
        if (value.trim().length < 10) {
          return 'Sebebi en az 10 karakter olmalıdır!';
        }
      }
    });

    if (!reassignmentReason) {
      return;
    }

    try {
      const response = await fetch(`/api/appointments/${appointmentId}/reassign-expert`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': adminUser?.id?.toString() || '',
          'x-user-name': encodeURIComponent(adminUser?.name || 'System')
        },
        body: JSON.stringify({ newExpertId: parseInt(selectedExpertId), reassignmentReason: reassignmentReason.trim() })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to reassign appointment');
      }

      await Swal.fire({
        icon: 'success',
        title: 'Atama Başarılı',
        text: 'Randevunun ataması başarıyla değiştirildi. İlgili taraflara bildirim gönderildi.',
        confirmButtonColor: '#3b82f6'
      });

      // Reload appointments
      loadAppointments();
    } catch (error) {
      console.error('Error reassigning appointment:', error);
      await Swal.fire({
        icon: 'error',
        title: 'Hata',
        text:
          error instanceof Error
            ? error.message
            : 'Atama değiştirilirken hata oluştu',
        confirmButtonColor: '#ef4444'
      });
    }
  };

  const exportToExcel = (appointmentsToExport: Appointment[], fileName: string) => {
    if (appointmentsToExport.length === 0) {
      Swal.fire({
        icon: 'warning',
        title: 'Dışa Aktar',
        text: 'Dışa aktarılacak randevu bulunamadı',
        confirmButtonColor: '#3b82f6'
      });
      return;
    }

    const data = appointmentsToExport.map(apt => ({
      'Çalışan Adı': apt.userName,
      'E-posta': apt.userEmail,
      'Telefon': apt.userPhone,
      'Ticket No': apt.ticketNo || '-',
      'Uzman': apt.expertName,
      'Tarih': apt.date,
      'Saat': apt.time,
      'Durum': (() => {
        switch (apt.status) {
          case 'pending':
            return 'Beklemede';
          case 'approved':
            return 'Onaylı';
          case 'cancelled':
            return 'İptal Edildi';
          case 'completed':
            return 'Tamamlandı';
          default:
            return apt.status;
        }
      })()
    }));

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Randevular');

    // Set column widths
    const columnWidths = [
      { wch: 20 }, // Çalışan Adı
      { wch: 25 }, // E-posta
      { wch: 15 }, // Telefon
      { wch: 15 }, // Ticket No
      { wch: 15 }, // Uzman
      { wch: 12 }, // Tarih
      { wch: 10 }, // Saat
      { wch: 12 }  // Durum
    ];
    worksheet['!cols'] = columnWidths;

    const today = new Date().toISOString().split('T')[0];
    XLSX.writeFile(workbook, `${fileName}_${today}.xlsx`);
  };

  // Filter by status and expert
  const filteredByStatusAndExpert = (() => {
    let result = appointments;

    if (filter === 'my' && adminUser) {
      // Benim randevularım tabında tamamlanan randevular gözükmemeli
      result = result.filter(a => a.expertId === adminUser.id && a.status !== 'completed');
    } else if (filter !== 'all') {
      result = result.filter(a => a.status === filter);
    }

    return result;
  })();

  // Filter by search query
  const searchFilteredAppointments = filteredByStatusAndExpert.filter(a => {
    const query = searchQuery.toLowerCase();
    return (
      a.userName.toLowerCase().includes(query) ||
      a.userEmail.toLowerCase().includes(query) ||
      a.userPhone.includes(query) ||
      a.ticketNo?.toLowerCase().includes(query) ||
      a.expertName.toLowerCase().includes(query)
    );
  });

  // Sort by date and time (closest to furthest from now)
  const now = new Date();
  const sortedAppointments = [...searchFilteredAppointments].sort((a, b) => {
    const aDateTime = new Date(a.date + 'T' + a.time);
    const bDateTime = new Date(b.date + 'T' + b.time);

    // Calculate distance from now
    const aDistance = Math.abs(aDateTime.getTime() - now.getTime());
    const bDistance = Math.abs(bDateTime.getTime() - now.getTime());

    return aDistance - bDistance;
  });

  // Pagination
  const totalPages = Math.ceil(sortedAppointments.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedAppointments = sortedAppointments.slice(startIndex, endIndex);

  // Reset to page 1 when filter changes
  React.useEffect(() => {
    setCurrentPage(1);
  }, [filter, searchQuery]);

  // Calculate completed appointments count for current expert
  const completedCount = React.useMemo(() => {
    if (!adminUser?.id) return 0;
    return appointments.filter(
      apt => apt.status === 'completed' && apt.expertId === adminUser.id
    ).length;
  }, [appointments, adminUser?.id]);

  // Calculate pending appointments count for current expert
  const pendingCount = React.useMemo(() => {
    if (!adminUser?.id) return 0;
    return appointments.filter(
      apt => apt.status === 'pending' && apt.expertId === adminUser.id
    ).length;
  }, [appointments, adminUser?.id]);

  return (
    <div className="space-y-4 sm:space-y-6">
      <h2 className="text-xl sm:text-2xl font-bold">Randevu Yönetimi</h2>

      {/* Completed Appointments Card - Only in "Tamamlananlar" tab */}
      {adminUser && filter === 'completed' && (
        <div className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-lg p-4 sm:p-5 shadow-sm">
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="bg-green-100 rounded-full p-2 sm:p-3">
              <CheckCircle className="w-5 h-5 sm:w-6 sm:h-6 text-green-600" />
            </div>
            <div className="flex-1">
              <p className="text-xs sm:text-sm text-gray-600 font-medium">Tamamlanan Randevular</p>
              <p className="text-2xl sm:text-3xl font-bold text-green-700">{completedCount}</p>
            </div>
          </div>
        </div>
      )}

      {/* Pending Appointments Card - Only in "Benim Randevularım" tab */}
      {adminUser && filter === 'my' && (
        <div 
          onClick={() => {
            // Filter to show only pending appointments for current user
            setFilter('pending');
            // Update URL to reflect the filter change
            const newSearchParams = new URLSearchParams(searchParams);
            newSearchParams.set('filter', 'pending');
            newSearchParams.set('expertId', adminUser.id.toString());
            window.history.pushState({}, '', `${window.location.pathname}?${newSearchParams.toString()}`);
          }}
          className="bg-gradient-to-r from-yellow-50 to-amber-50 border border-yellow-200 rounded-lg p-4 sm:p-5 shadow-sm cursor-pointer hover:shadow-md transition-shadow"
        >
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="bg-yellow-100 rounded-full p-2 sm:p-3">
              <Clock className="w-5 h-5 sm:w-6 sm:h-6 text-yellow-600" />
            </div>
            <div className="flex-1">
              <p className="text-xs sm:text-sm text-gray-600 font-medium">Onay Bekleyen Randevu Talepleriniz</p>
              <p className="text-2xl sm:text-3xl font-bold text-yellow-700">{pendingCount}</p>
            </div>
            <div className="text-yellow-600">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </div>
        </div>
      )}

      {/* Filter Buttons - Mobile Responsive */}
      <div className="flex flex-wrap gap-2 mb-4">
        {[
          { label: 'Benim Randevularım', key: 'my' as const },
          { label: 'Tümü', key: 'all' as const },
          { label: 'Beklemede', key: 'pending' as const },
          { label: 'Onaylı', key: 'approved' as const },
          { label: 'Tamamlananlar', key: 'completed' as const },
          { label: 'İptal', key: 'cancelled' as const }
        ].map(({ label, key }) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`px-3 sm:px-4 py-1.5 sm:py-2 rounded text-xs sm:text-sm font-medium transition ${
              filter === key
                ? 'bg-blue-500 text-white'
                : 'bg-gray-200 text-gray-800 hover:bg-gray-300'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Export Buttons */}
      <div className="flex flex-wrap gap-2 mb-4">
        <button
          onClick={() => exportToExcel(sortedAppointments, 'Tüm_Randevular')}
          className="flex items-center gap-2 px-3 sm:px-4 py-1.5 sm:py-2 bg-green-500 text-white rounded text-xs sm:text-sm font-medium hover:bg-green-600 transition"
          title="Mevcut filtreye göre tüm randevuları Excel'e aktar"
        >
          <Download size={16} />
          <span className="hidden sm:inline">Excel'e Aktar</span>
          <span className="sm:hidden">Export</span>
        </button>
      </div>

      {/* Search Filter */}
      <div className="mb-4">
        <input
          type="text"
          placeholder="Çalışan adı, email, telefon, ticket no veya uzman adı ile ara..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition"
        />
      </div>

      {/* Appointments Table - Mobile Card View on Small Screens */}

      {loading && (
        <div className="text-center py-8 text-gray-500">Yükleniyor...</div>
      )}

      {!loading && sortedAppointments.length === 0 && (
        <div className="text-center py-8 text-gray-500 bg-white rounded-lg">Randevu bulunamadı</div>
      )}

      {!loading && sortedAppointments.length > 0 && (
        <>
          {/* Desktop Table */}
          <div className="hidden md:block bg-white rounded-lg shadow overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="px-4 lg:px-6 py-3 text-left text-sm font-semibold">Çalışan</th>
                    <th className="px-4 lg:px-6 py-3 text-left text-sm font-semibold">Telefon</th>
                    <th className="px-4 lg:px-6 py-3 text-left text-sm font-semibold">Ticket No</th>
                    <th className="px-4 lg:px-6 py-3 text-left text-sm font-semibold">Uzman</th>
                    <th className="px-4 lg:px-6 py-3 text-left text-sm font-semibold">Tarih</th>
                    <th className="px-4 lg:px-6 py-3 text-left text-sm font-semibold">Saat</th>
                    <th className="px-4 lg:px-6 py-3 text-left text-sm font-semibold">Durum</th>
                    <th className="px-4 lg:px-6 py-3 text-left text-sm font-semibold">İşlem</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedAppointments.map((apt) => (
                    <tr 
                      key={apt.id} 
                      className={`border-t hover:bg-gray-50 ${filter === 'my' ? 'cursor-pointer' : ''}`}
                      onClick={() => filter === 'my' && handlePhoneInfoClick(apt)}
                      title={filter === 'my' ? 'Telefon bilgilerini görmek için tıklayın' : ''}
                    >
                      <td className="px-4 lg:px-6 py-3 text-sm">{apt.userName}</td>
                      <td className="px-4 lg:px-6 py-3 text-sm font-mono text-xs">{apt.userPhone}</td>
                      <td className="px-4 lg:px-6 py-3 text-sm font-mono">{apt.ticketNo || '-'}</td>
                      <td className="px-4 lg:px-6 py-3 text-sm">{apt.expertName}</td>
                      <td className="px-4 lg:px-6 py-3 text-sm">{apt.date}</td>
                      <td className="px-4 lg:px-6 py-3 text-sm">{apt.time}</td>
                      <td className="px-4 lg:px-6 py-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${
                          apt.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                          apt.status === 'approved' ? 'bg-green-100 text-green-800' :
                          apt.status === 'completed' ? 'bg-blue-100 text-blue-800' :
                          'bg-red-100 text-red-800'
                        }`}>
                          {apt.status === 'pending' && <Clock className="w-3 h-3" />}
                          {apt.status === 'approved' && <CheckCircle className="w-3 h-3" />}
                          {apt.status === 'completed' && <CheckCircle className="w-3 h-3" />}
                          {apt.status === 'cancelled' && <XCircle className="w-3 h-3" />}
                          <span className="hidden sm:inline">{apt.status === 'pending' ? 'Beklemede' : apt.status === 'approved' ? 'Onaylı' : apt.status === 'completed' ? 'Tamamlandı' : 'İptal'}</span>
                        </span>
                      </td>
                      <td className="px-4 lg:px-6 py-3 space-x-1 sm:space-x-2" onClick={(e) => e.stopPropagation()}>
                        {apt.status === 'pending' && (
                          <>
                            <button
                              onClick={() => handleApprove(apt.id)}
                              className="text-xs sm:text-sm text-green-600 hover:text-green-800 font-semibold hover:bg-green-50 px-2 py-1 rounded"
                              title="Onayla"
                            >
                              ✓
                            </button>
                            <button
                              onClick={() => handleCancel(apt.id)}
                              className="text-xs sm:text-sm text-red-600 hover:text-red-800 font-semibold hover:bg-red-50 px-2 py-1 rounded"
                              title="Red"
                            >
                              ✕
                            </button>
                            <button
                              onClick={() => handleReassign(apt.id)}
                              className="text-xs sm:text-sm text-blue-600 hover:text-blue-800 font-semibold hover:bg-blue-50 px-2 py-1 rounded inline-flex items-center gap-1"
                              title="Atama Değiştir"
                            >
                              <Edit className="w-3 h-3" />
                              <span className="hidden sm:inline">Atama</span>
                            </button>
                          </>
                        )}
                        {apt.status === 'approved' && (
                          <>
                            <button
                              onClick={() => handleRemindAppointment(apt.id)}
                              className="text-xs sm:text-sm text-blue-600 hover:text-blue-800 font-semibold hover:bg-blue-50 px-2 py-1 rounded"
                              title="Hatırlat"
                            >
                              🔔
                            </button>
                            <button
                              onClick={() => handleReschedule(apt)}
                              className="text-xs sm:text-sm text-indigo-600 hover:text-indigo-800 font-semibold hover:bg-indigo-50 px-2 py-1 rounded inline-flex items-center gap-1"
                              title="Tarih Değiştir"
                            >
                              <Calendar className="w-3 h-3" />
                              <span className="hidden sm:inline">Tarih</span>
                            </button>
                            <button
                              onClick={() => handleReassign(apt.id)}
                              className="text-xs sm:text-sm text-purple-600 hover:text-purple-800 font-semibold hover:bg-purple-50 px-2 py-1 rounded inline-flex items-center gap-1"
                              title="Atama Değiştir"
                            >
                              <Edit className="w-3 h-3" />
                              <span className="hidden sm:inline">Atama</span>
                            </button>
                            <button
                              onClick={() => {
                                setSelectedAppointmentForStatus(apt);
                                setShowStatusModal(true);
                              }}
                              className="text-xs sm:text-sm text-orange-600 hover:text-orange-800 font-semibold hover:bg-orange-50 px-2 py-1 rounded"
                              title="Durum Değiştir"
                            >
                              ⚙️
                            </button>
                          </>
                        )}
                        {apt.status === 'cancelled' && (
                          <button
                            onClick={() => handleDelete(apt.id)}
                            className="text-xs sm:text-sm text-red-600 hover:text-red-800 font-semibold hover:bg-red-50 px-2 py-1 rounded inline-flex items-center gap-1"
                            title="Sil"
                          >
                            <Trash2 className="w-3 h-3" />
                            <span className="hidden sm:inline">Sil</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile Card View */}
          <div className="md:hidden space-y-3">
            {paginatedAppointments.map((apt) => (
              <div 
                key={apt.id} 
                className={`bg-white rounded-lg shadow p-4 space-y-3 ${filter === 'my' ? 'cursor-pointer' : ''}`}
                onClick={() => filter === 'my' && handlePhoneInfoClick(apt)}
                title={filter === 'my' ? 'Telefon bilgilerini görmek için tıklayın' : ''}
              >
                <div className="flex justify-between items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-gray-900">{apt.userName}</p>
                    <p className="text-xs text-gray-600 truncate">{apt.userEmail}</p>
                    <p className="text-xs text-gray-600">{apt.userPhone}</p>
                    {apt.ticketNo && (
                      <p className="text-xs text-gray-600 font-mono">Ticket: {apt.ticketNo}</p>
                    )}
                    <p className="font-medium text-xs text-gray-700 mt-2">{apt.expertName}</p>
                    <p className="text-xs text-gray-600">{apt.date} {apt.time}</p>
                  </div>
                  <span className={`flex-shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${
                    apt.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                    apt.status === 'approved' ? 'bg-green-100 text-green-800' :
                    apt.status === 'completed' ? 'bg-blue-100 text-blue-800' :
                    'bg-red-100 text-red-800'
                  }`}>
                    {apt.status === 'pending' && <Clock className="w-3 h-3" />}
                    {apt.status === 'approved' && <CheckCircle className="w-3 h-3" />}
                    {apt.status === 'completed' && <CheckCircle className="w-3 h-3" />}
                    {apt.status === 'cancelled' && <XCircle className="w-3 h-3" />}
                    {apt.status === 'pending' ? 'Beklemede' : apt.status === 'approved' ? 'Onaylı' : apt.status === 'completed' ? 'Tamamlandı' : 'İptal'}
                  </span>
                </div>

                {apt.status === 'pending' && (
                  <div className="flex gap-2 pt-2" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => handleApprove(apt.id)}
                      className="flex-1 bg-green-50 hover:bg-green-100 text-green-700 text-sm font-semibold py-2 rounded transition"
                    >
                      Onayla
                    </button>
                    <button
                      onClick={() => handleCancel(apt.id)}
                      className="flex-1 bg-red-50 hover:bg-red-100 text-red-700 text-sm font-semibold py-2 rounded transition"
                    >
                      Red
                    </button>
                    <button
                      onClick={() => handleReassign(apt.id)}
                      className="flex-1 bg-blue-50 hover:bg-blue-100 text-blue-700 text-sm font-semibold py-2 rounded transition inline-flex items-center justify-center gap-2"
                    >
                      <Edit className="w-4 h-4" />
                      Atama
                    </button>
                  </div>
                )}

                {apt.status === 'approved' && (
                  <div className="flex flex-wrap gap-2 pt-2" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => handleRemindAppointment(apt.id)}
                      className="flex-1 bg-blue-50 hover:bg-blue-100 text-blue-700 text-sm font-semibold py-2 rounded transition"
                    >
                      🔔 Hatırlat
                    </button>
                    <button
                      onClick={() => handleReschedule(apt)}
                      className="flex-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-sm font-semibold py-2 rounded transition inline-flex items-center justify-center gap-2"
                    >
                      <Calendar className="w-4 h-4" />
                      Tarih
                    </button>
                    <button
                      onClick={() => handleReassign(apt.id)}
                      className="flex-1 bg-purple-50 hover:bg-purple-100 text-purple-700 text-sm font-semibold py-2 rounded transition inline-flex items-center justify-center gap-2"
                    >
                      <Edit className="w-4 h-4" />
                      Atama
                    </button>
                    <button
                      onClick={() => {
                        setSelectedAppointmentForStatus(apt);
                        setShowStatusModal(true);
                      }}
                      className="flex-1 bg-orange-50 hover:bg-orange-100 text-orange-700 text-sm font-semibold py-2 rounded transition"
                    >
                      ⚙️ Durum
                    </button>
                  </div>
                )}

                {apt.status === 'cancelled' && (
                  <div className="flex gap-2 pt-2" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => handleDelete(apt.id)}
                      className="flex-1 bg-red-50 hover:bg-red-100 text-red-700 text-sm font-semibold py-2 rounded transition inline-flex items-center justify-center gap-2"
                    >
                      <Trash2 className="w-4 h-4" />
                      Sil
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex flex-wrap items-center justify-center gap-2 mt-6 p-4">
              <button
                onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                disabled={currentPage === 1}
                className="px-3 py-2 rounded text-sm font-medium bg-gray-200 text-gray-800 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-300 transition"
              >
                ← Önceki
              </button>

              {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                <button
                  key={page}
                  onClick={() => setCurrentPage(page)}
                  className={`px-3 py-2 rounded text-sm font-medium transition ${
                    currentPage === page
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-200 text-gray-800 hover:bg-gray-300'
                  }`}
                >
                  {page}
                </button>
              ))}

              <button
                onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                disabled={currentPage === totalPages}
                className="px-3 py-2 rounded text-sm font-medium bg-gray-200 text-gray-800 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-300 transition"
              >
                Sonraki →
              </button>

              <div className="w-full flex justify-center mt-2">
                <span className="text-sm text-gray-600">
                  Sayfa {currentPage} / {totalPages} (Toplam: {sortedAppointments.length} randevu)
                </span>
              </div>
            </div>
          )}
        </>
      )}

      {/* Status Change Modal */}
      {showStatusModal && selectedAppointmentForStatus && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-bold text-gray-900">Durum Değiştir</h3>
                <button
                  onClick={() => setShowStatusModal(false)}
                  className="text-gray-400 hover:text-gray-600 text-2xl font-bold"
                >
                  ×
                </button>
              </div>

              <div className="mb-6 p-3 bg-gray-50 rounded">
                <p className="text-sm font-medium text-gray-900">{selectedAppointmentForStatus.userName}</p>
                <p className="text-xs text-gray-600">{selectedAppointmentForStatus.date} - {selectedAppointmentForStatus.time}</p>
              </div>

              <div className="space-y-3">
                <button
                  onClick={() => handleChangeStatus('completed')}
                  className="w-full bg-green-50 hover:bg-green-100 text-green-700 font-semibold py-3 rounded-lg transition"
                >
                  ✓ Tamamlandı
                </button>
                <button
                  onClick={() => handleChangeStatus('cancelled')}
                  className="w-full bg-red-50 hover:bg-red-100 text-red-700 font-semibold py-3 rounded-lg transition"
                >
                  ✕ İptal Edildi
                </button>
                <button
                  onClick={() => setShowStatusModal(false)}
                  className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold py-3 rounded-lg transition"
                >
                  Vazgeç
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Phone Info Modal */}
      {showPhoneInfoModal && selectedAppointmentForPhone && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50" onClick={() => setShowPhoneInfoModal(false)}>
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-bold text-gray-900">Telefon Bilgileri</h3>
                <button
                  onClick={() => setShowPhoneInfoModal(false)}
                  className="text-gray-400 hover:text-gray-600 text-2xl font-bold"
                >
                  ×
                </button>
              </div>

              <div className="mb-6 p-3 bg-gray-50 rounded">
                <p className="text-sm font-medium text-gray-900">{selectedAppointmentForPhone.userName}</p>
                <p className="text-xs text-gray-600">{selectedAppointmentForPhone.userEmail}</p>
                <p className="text-xs text-gray-600">{selectedAppointmentForPhone.date} - {selectedAppointmentForPhone.time}</p>
              </div>

              {loadingPhoneInfo ? (
                <div className="text-center py-8 text-gray-500">Yükleniyor...</div>
              ) : phoneInfo ? (
                <>
                  {phoneInfo.phones && phoneInfo.phones.length > 0 ? (
                    <div className="space-y-4">
                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                        <p className="text-sm text-blue-800 font-medium mb-2">
                          {phoneInfo.phones.length} adet telefon bulundu
                        </p>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full border-collapse">
                          <thead>
                            <tr className="bg-gray-100">
                              <th className="px-4 py-2 text-left text-sm font-semibold border">Envanter No</th>
                              <th className="px-4 py-2 text-left text-sm font-semibold border">Marka</th>
                              <th className="px-4 py-2 text-left text-sm font-semibold border">Model</th>
                              <th className="px-4 py-2 text-left text-sm font-semibold border">IMEI1</th>
                            </tr>
                          </thead>
                          <tbody>
                            {phoneInfo.phones.map((phone, index) => (
                              <tr key={index} className="hover:bg-gray-50">
                                <td className="px-4 py-2 text-sm border font-mono">{phone.inventory_number}</td>
                                <td className="px-4 py-2 text-sm border">{phone.brand}</td>
                                <td className="px-4 py-2 text-sm border">{phone.model}</td>
                                <td className="px-4 py-2 text-sm border font-mono">{phone.imei1}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <p className="text-gray-500 mb-2">
                        {phoneInfo.message || 'Bu çalışana atanmış telefon bulunamadı'}
                      </p>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-center py-8 text-gray-500">Bilgi yüklenemedi</div>
              )}

              <div className="mt-6">
                <button
                  onClick={() => setShowPhoneInfoModal(false)}
                  className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold py-3 rounded-lg transition"
                >
                  Kapat
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Reschedule Modal */}
      {showRescheduleModal && selectedAppointmentForReschedule && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50" onClick={() => setShowRescheduleModal(false)}>
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-bold text-gray-900">Randevu Tarih Değişikliği</h3>
                <button
                  onClick={() => setShowRescheduleModal(false)}
                  className="text-gray-400 hover:text-gray-600 text-2xl font-bold"
                >
                  ×
                </button>
              </div>

              <div className="mb-6 p-3 bg-gray-50 rounded">
                <p className="text-sm font-medium text-gray-900">{selectedAppointmentForReschedule.userName}</p>
                <p className="text-xs text-gray-600">{selectedAppointmentForReschedule.userEmail}</p>
                <p className="text-xs text-gray-600">
                  <strong>Mevcut Tarih:</strong> {selectedAppointmentForReschedule.date} - {selectedAppointmentForReschedule.time}
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Yeni Tarih <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={rescheduleDate}
                    onChange={(e) => handleRescheduleDateChange(e.target.value)}
                    min={new Date().toISOString().split('T')[0]}
                    className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Yeni Saat <span className="text-red-500">*</span>
                  </label>
                  {availableTimes.length > 0 ? (
                    <select
                      value={rescheduleTime}
                      onChange={(e) => setRescheduleTime(e.target.value)}
                      className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition"
                    >
                      <option value="">Saat seçiniz</option>
                      {availableTimes.map((time) => (
                        <option key={time} value={time}>
                          {time}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg text-sm bg-gray-100 text-gray-500">
                      {rescheduleDate ? 'Bu tarih için müsait saat bulunmamaktadır' : 'Önce tarih seçiniz'}
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Değişiklik Sebebi <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    value={rescheduleReason}
                    onChange={(e) => setRescheduleReason(e.target.value)}
                    placeholder="Tarih değişikliği sebebini açıklayınız (en az 10 karakter)"
                    rows={4}
                    className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition resize-none"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    {rescheduleReason.length}/10 karakter (minimum)
                  </p>
                </div>

                <div className="flex gap-3 pt-4">
                  <button
                    onClick={handleSubmitReschedule}
                    disabled={loadingReschedule || !rescheduleDate || !rescheduleTime || rescheduleReason.trim().length < 10}
                    className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-lg transition"
                  >
                    {loadingReschedule ? 'Gönderiliyor...' : 'Talebi Gönder'}
                  </button>
                  <button
                    onClick={() => setShowRescheduleModal(false)}
                    className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold py-3 rounded-lg transition"
                  >
                    İptal
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
