import React, { useState, useEffect } from 'react';
import { Clock, Plus, Trash2, AlertCircle, CheckCircle, Calendar, ChevronLeft, ChevronRight, X } from 'lucide-react';
import Swal from 'sweetalert2';

interface Availability {
  id: string;
  availabilityDate: string;
  startTime: string;
  endTime: string;
}

interface Appointment {
  id: number;
  user_name: string;
  user_email: string;
  user_phone: string;
  ticket_no?: string;
  date: string;
  time: string;
  status: 'pending' | 'approved' | 'cancelled';
}

interface AdminUser {
  id: number;
  name: string;
  email: string;
  role: string;
}

interface Props {
  adminUser: AdminUser | null;
}

const TIME_SLOTS = [
  '09:00', '10:00', '11:00', '13:00', '14:00', '15:00', '16:00'
];

interface Expert {
  id: number;
  name: string;
  email: string;
}

export function AvailabilityManager({ adminUser }: Props) {
  const [availabilities, setAvailabilities] = useState<Availability[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [currentWeekStart, setCurrentWeekStart] = useState<Date>(new Date());
  const [selectedTimeSlots, setSelectedTimeSlots] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingAppointments, setLoadingAppointments] = useState(false);
  const [showAppointmentsModal, setShowAppointmentsModal] = useState(false);
  const [selectedDateAppointments, setSelectedDateAppointments] = useState<Appointment[]>([]);
  const [experts, setExperts] = useState<Expert[]>([]);
  const [selectedExpertId, setSelectedExpertId] = useState<number | null>(null);

  const dayNames = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma'];

  useEffect(() => {
    // Set initial selected date to today (if weekday) or next Monday
    const today = new Date();
    const dayOfWeek = today.getDay();
    let initialDate = new Date(today);
    
    // If weekend, set to next Monday
    if (dayOfWeek === 0) { // Sunday
      initialDate.setDate(today.getDate() + 1);
    } else if (dayOfWeek === 6) { // Saturday
      initialDate.setDate(today.getDate() + 2);
    }
    
    const dateStr = formatDate(initialDate);
    setSelectedDate(dateStr);
    setCurrentWeekStart(getWeekStart(initialDate));
    
    // Load experts if superadmin
    if (adminUser?.role === 'superadmin') {
      loadExperts();
    } else {
      // Set selected expert to current user if not superadmin
      setSelectedExpertId(adminUser?.id || null);
      loadAvailabilities();
    }
  }, [adminUser]);

  useEffect(() => {
    const expertId = selectedExpertId || adminUser?.id;
    if (expertId) {
      loadAvailabilities();
    }
  }, [selectedExpertId, adminUser]);

  useEffect(() => {
    if (selectedDate) {
      const expertId = selectedExpertId || adminUser?.id;
      if (expertId) {
        loadAppointmentsForDate(selectedDate);
        // Load time slots when date or availabilities change
        if (availabilities.length > 0 || selectedDate) {
          loadTimeSlotsForDate(selectedDate);
        }
      }
    }
  }, [selectedDate, availabilities, selectedExpertId, adminUser]);

  const getWeekStart = (date: Date): Date => {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust to Monday
    return new Date(d.setDate(diff));
  };

  const formatDate = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const formatDateDisplay = (dateStr: string): string => {
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString('tr-TR', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
  };

  const getWeekDays = (): Date[] => {
    const days: Date[] = [];
    for (let i = 0; i < 5; i++) {
      const date = new Date(currentWeekStart);
      date.setDate(currentWeekStart.getDate() + i);
      days.push(date);
    }
    return days;
  };

  const isWeekend = (date: Date): boolean => {
    const day = date.getDay();
    return day === 0 || day === 6;
  };

  const getDayOfWeek = (date: Date): number => {
    const day = date.getDay();
    return day === 0 ? 6 : day - 1; // Monday = 0, Sunday = 6
  };

  const loadExperts = async () => {
    try {
      const response = await fetch('/api/experts');
      if (!response.ok) throw new Error('Failed to fetch experts');
      const data = await response.json();
      setExperts(data);
      // Set logged-in user as default, or first expert if not in list
      if (data.length > 0 && !selectedExpertId) {
        const currentUserInList = data.find(e => e.id === adminUser?.id);
        if (currentUserInList) {
          setSelectedExpertId(adminUser.id);
        } else {
          setSelectedExpertId(data[0].id);
        }
      }
    } catch (error) {
      console.error('Error loading experts:', error);
    }
  };

  const loadAvailabilities = async () => {
    try {
      const expertId = selectedExpertId || adminUser?.id;
      if (!expertId) {
        setAvailabilities([]);
        return;
      }
      const response = await fetch(`/api/availability?expertId=${expertId}`);
      if (!response.ok) throw new Error('Failed to fetch availabilities');
      const data = await response.json();
      const mapped = data.map((a: any) => {
        // Parse ISO date string and extract just the date part (YYYY-MM-DD)
        const dateObj = new Date(a.availability_date);
        const dateString = dateObj.toISOString().split('T')[0];

        return {
          id: a.id.toString(),
          availabilityDate: dateString,
          startTime: a.start_time ? a.start_time.substring(0, 5) : '', // "HH:MM" format
          endTime: a.end_time ? a.end_time.substring(0, 5) : '' // "HH:MM" format
        };
      });
      setAvailabilities(mapped);
      console.log('Availabilities loaded:', mapped.length, 'items for expert', expertId);
    } catch (error) {
      console.error('Error loading availabilities:', error);
      setAvailabilities([]);
    }
  };

  const loadAppointmentsForDate = async (date: string) => {
    const expertId = selectedExpertId || adminUser?.id;
    if (!expertId) return;
    
    setLoadingAppointments(true);
    try {
      const response = await fetch(`/api/appointments?expertId=${expertId}&date=${date}`);
      if (!response.ok) throw new Error('Failed to fetch appointments');
      const data = await response.json();
      setAppointments(data.appointments || []);
    } catch (error) {
      console.error('Error loading appointments:', error);
      setAppointments([]);
    } finally {
      setLoadingAppointments(false);
    }
  };

  const loadTimeSlotsForDate = async (date: string) => {
    const expertId = selectedExpertId || adminUser?.id;
    if (!expertId) return;

    try {
      const response = await fetch(`/api/availability?expertId=${expertId}`);
      if (!response.ok) throw new Error('Failed to fetch availabilities');
      const data = await response.json();

      // Get availability for this specific date
      const dateAvailabilities = data.filter((a: any) => a.availability_date === date);

      // Get all time slots from availabilities (exact startTime matches)
      const availableSlots: string[] = [];
      dateAvailabilities.forEach((avail: any) => {
        const startTime = avail.start_time.substring(0, 5); // "HH:MM"
        // Only add if it's in our TIME_SLOTS list and not already added
        if (TIME_SLOTS.includes(startTime) && !availableSlots.includes(startTime)) {
          availableSlots.push(startTime);
        }
      });

      setSelectedTimeSlots(availableSlots.sort());
    } catch (error) {
      console.error('Error loading time slots:', error);
      setSelectedTimeSlots([]);
    }
  };

  const handleDateSelect = (date: Date) => {
    if (isWeekend(date)) {
      Swal.fire({
        icon: 'warning',
        title: 'Hafta Sonu Seçilemez',
        text: 'Hafta sonu günlerinde müsaitlik ayarlanamaz',
        confirmButtonColor: '#3b82f6'
      });
      return;
    }
    
    const dateStr = formatDate(date);
    const todayStr = formatDate(new Date());
    
    // Allow selecting today and future dates only
    if (dateStr < todayStr) {
      Swal.fire({
        icon: 'warning',
        title: 'Geçmiş Tarih',
        text: 'Geçmiş tarihler için müsaitlik ayarlanamaz',
        confirmButtonColor: '#3b82f6'
      });
      return;
    }
    
    setSelectedDate(dateStr);
    setCurrentWeekStart(getWeekStart(date));
  };

  const handleAddTimeSlot = async (timeSlot: string) => {
    const expertId = selectedExpertId || adminUser?.id;
    if (!expertId || !selectedDate) return;

    // Check if time slot is in the past
    if (isTimeSlotPast(selectedDate, timeSlot)) {
      await Swal.fire({
        icon: 'warning',
        title: 'Süre Geçti',
        text: 'Geçmiş tarih ve saatler için müsaitlik ayarlanamaz',
        confirmButtonColor: '#3b82f6'
      });
      return;
    }

    // Calculate end time: same hour, 59 minutes (e.g., 09:00 -> 09:59)
    const [hours, minutes] = timeSlot.split(':').map(Number);
    const endTime = `${String(hours).padStart(2, '0')}:59`;

    // Check if this time slot already exists for this date
    console.log('Debug - Adding time slot:', {
      selectedDate,
      timeSlot,
      expertId: selectedExpertId || adminUser?.id,
      availabilitiesCount: availabilities.length,
      availabilitiesForDate: availabilities.filter(a => a.availabilityDate === selectedDate).length
    });

    const existing = availabilities.find(
      a => a.availabilityDate === selectedDate &&
      a.startTime === timeSlot
    );

    if (existing) {
      console.log('Found existing availability:', existing);
      // If exists but with different endTime, update it
      if (existing.endTime !== endTime) {
        const result = await Swal.fire({
          icon: 'question',
          title: 'Müsaitlik Güncelle',
          text: `Bu saat (${timeSlot}) zaten müsaitlik olarak tanımlı (${existing.endTime}). Yeni format (${endTime}) ile güncellemek ister misiniz?`,
          showCancelButton: true,
          confirmButtonText: 'Güncelle',
          cancelButtonText: 'İptal',
          confirmButtonColor: '#3b82f6'
        });

        if (result.isConfirmed) {
          try {
            const updateResponse = await fetch(`/api/availability/${existing.id}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                availabilityDate: selectedDate,
                startTime: timeSlot,
                endTime: endTime
              })
            });

            if (!updateResponse.ok) throw new Error('Failed to update availability');

            await loadAvailabilities();
            await loadTimeSlotsForDate(selectedDate);

            await Swal.fire({
              icon: 'success',
              title: 'Başarılı',
              text: 'Müsaitlik güncellendi',
              confirmButtonColor: '#3b82f6',
              timer: 1500
            });
            return;
          } catch (error) {
            console.error('Error updating availability:', error);
            await Swal.fire({
              icon: 'error',
              title: 'Hata',
              text: 'Müsaitlik güncellenirken hata oluştu',
              confirmButtonColor: '#ef4444'
            });
            return;
          }
        } else {
          return;
        }
      } else {
        await Swal.fire({
          icon: 'info',
          title: 'Zaten Mevcut',
          text: `Bu saat (${timeSlot}) zaten müsaitlik olarak tanımlı`,
          confirmButtonColor: '#3b82f6'
        });
        return;
      }
    }

    try {
      const selectedExpert = experts.find(e => e.id === expertId) || adminUser;
      const requestBody = {
        expertId: expertId,
        availabilityDate: selectedDate,
        startTime: timeSlot,
        endTime: endTime,
        adminName: adminUser?.name || selectedExpert?.name || 'Admin',
        adminEmail: adminUser?.email || selectedExpert?.email || 'admin@example.com'
      };

      const response = await fetch('/api/availability', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': adminUser?.id?.toString() || '',
          'x-user-name': encodeURIComponent(adminUser?.name || 'System')
        },
        body: JSON.stringify(requestBody)
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Müsaitlik eklenirken hata oluştu');
      }

      // Add new availability to state immediately
      const newAvailability: Availability = {
        id: data.id.toString(),
        availabilityDate: selectedDate,
        startTime: timeSlot,
        endTime: endTime
      };

      setAvailabilities([...availabilities, newAvailability]);

      // Also load time slots for the date
      const dateObj = new Date(selectedDate + 'T00:00:00');
      const dayOfWeek = getDayOfWeek(dateObj);
      const dayName = dayNames[dayOfWeek];

      // Update selected time slots
      setSelectedTimeSlots([...selectedTimeSlots, timeSlot].sort());

      await Swal.fire({
        icon: 'success',
        title: 'Başarılı',
        text: 'Müsaitlik eklendi',
        confirmButtonColor: '#3b82f6',
        timer: 1500
      });
    } catch (error) {
      console.error('Error adding availability:', error);
      await Swal.fire({
        icon: 'error',
        title: 'Hata',
        text: error instanceof Error ? error.message : 'Müsaitlik eklenirken hata oluştu',
        confirmButtonColor: '#ef4444'
      });
    }
  };

  const handleRemoveTimeSlot = async (timeSlot: string) => {
    const expertId = selectedExpertId || adminUser?.id;
    if (!expertId || !selectedDate) return;

    // Check if time slot is in the past
    if (isTimeSlotPast(selectedDate, timeSlot)) {
      await Swal.fire({
        icon: 'warning',
        title: 'Süre Geçti',
        text: 'Geçmiş tarih ve saatler için müsaitlik düzenlenemez',
        confirmButtonColor: '#3b82f6'
      });
      return;
    }

    // Find availability with exact date and startTime match
    const availability = availabilities.find(
      a => a.availabilityDate === selectedDate &&
      a.startTime === timeSlot
    );

    if (!availability) return;

    const result = await Swal.fire({
      title: 'Müsaitliği Kaldır',
      text: 'Bu müsaitliği kaldırmak istediğinize emin misiniz?',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ef4444',
      cancelButtonColor: '#6b7280',
      confirmButtonText: 'Evet, Kaldır',
      cancelButtonText: 'İptal'
    });

    if (!result.isConfirmed) return;

    try {
      const response = await fetch(`/api/availability/${availability.id}`, {
        method: 'DELETE',
        headers: {
          'x-user-id': adminUser?.id?.toString() || '',
          'x-user-name': encodeURIComponent(adminUser?.name || 'System')
        }
      });
      
      if (!response.ok) throw new Error('Failed to delete availability');

      // Remove from state immediately
      setAvailabilities(availabilities.filter(a => a.id !== availability.id));

      // Remove from time slots
      setSelectedTimeSlots(selectedTimeSlots.filter(slot => slot !== timeSlot));

      await Swal.fire({
        icon: 'success',
        title: 'Başarılı',
        text: 'Müsaitlik kaldırıldı',
        confirmButtonColor: '#3b82f6',
        timer: 1500
      });
    } catch (error) {
      console.error('Error deleting availability:', error);
      await Swal.fire({
        icon: 'error',
        title: 'Hata',
        text: 'Müsaitlik kaldırılırken hata oluştu',
        confirmButtonColor: '#ef4444'
      });
    }
  };

  const isTimeSlotBooked = (timeSlot: string): boolean => {
    return appointments.some(apt => 
      apt.status === 'approved' && 
      apt.time.substring(0, 5) === timeSlot
    );
  };

  const getAppointmentForTimeSlot = (timeSlot: string): Appointment | undefined => {
    return appointments.find(apt => 
      apt.status === 'approved' && 
      apt.time.substring(0, 5) === timeSlot
    );
  };

  const isTimeSlotAvailable = (timeSlot: string): boolean => {
    if (!selectedDate) return false;

    // Normalize timeSlot format (ensure HH:MM format)
    const normalizedTimeSlot = timeSlot.length === 5 ? timeSlot : timeSlot.substring(0, 5);

    // Check if this exact time slot exists for this date
    const isAvailable = availabilities.some(
      a => {
        if (!a || !a.startTime || !a.availabilityDate) return false;
        const normalizedStartTime = a.startTime.length >= 5
          ? a.startTime.substring(0, 5)
          : a.startTime;
        return a.availabilityDate === selectedDate &&
        normalizedStartTime === normalizedTimeSlot;
      }
    );

    return isAvailable;
  };

  const handleShowAppointments = () => {
    const dateAppointments = appointments.filter(apt => apt.status === 'approved');
    setSelectedDateAppointments(dateAppointments);
    setShowAppointmentsModal(true);
  };

  const isTimeSlotPast = (dateStr: string, timeSlot: string): boolean => {
    if (!dateStr || !timeSlot) return false;
    
    const now = new Date();
    const [hours, minutes] = timeSlot.split(':').map(Number);
    const slotDateTime = new Date(dateStr + 'T00:00:00');
    slotDateTime.setHours(hours, minutes, 0, 0);
    
    return slotDateTime < now;
  };

  const handleRemoveAllForDay = async (date: Date) => {
    if (isWeekend(date)) {
      await Swal.fire({
        icon: 'warning',
        title: 'Hafta Sonu',
        text: 'Hafta sonu günlerinde müsaitlik ayarlanamaz',
        confirmButtonColor: '#3b82f6'
      });
      return;
    }

    const expertId = selectedExpertId || adminUser?.id;
    if (!expertId) return;

    const dateStr = formatDate(date);

    const result = await Swal.fire({
      title: 'Tüm Müsaitlikleri Kaldır',
      text: `${formatDateDisplay(dateStr)} için tüm müsaitlikleri kaldırmak istediğinize emin misiniz?`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ef4444',
      cancelButtonColor: '#6b7280',
      confirmButtonText: 'Evet, Tümünü Kaldır',
      cancelButtonText: 'İptal'
    });

    if (!result.isConfirmed) return;

    try {
      // Get all availabilities for this date
      const dateAvailabilities = availabilities.filter(a => a.availabilityDate === dateStr);

      if (dateAvailabilities.length === 0) {
        await Swal.fire({
          icon: 'info',
          title: 'Müsaitlik Yok',
          text: 'Bu gün için müsaitlik bulunmamaktadır',
          confirmButtonColor: '#3b82f6'
        });
        return;
      }

      // Delete all availabilities for this date
      const deletePromises = dateAvailabilities.map(avail =>
        fetch(`/api/availability/${avail.id}`, {
          method: 'DELETE',
          headers: {
            'x-user-id': adminUser?.id?.toString() || '',
            'x-user-name': encodeURIComponent(adminUser?.name || 'System')
          }
        })
      );

      await Promise.all(deletePromises);

      // Remove deleted availabilities from state immediately
      const remainingAvailabilities = availabilities.filter(a => a.availabilityDate !== dateStr);
      setAvailabilities(remainingAvailabilities);

      // If viewing this date, update time slots
      if (selectedDate === dateStr) {
        setSelectedTimeSlots([]);
      }

      await Swal.fire({
        icon: 'success',
        title: 'Başarılı',
        text: 'Tüm müsaitlikler kaldırıldı',
        confirmButtonColor: '#3b82f6',
        timer: 1500
      });
    } catch (error) {
      console.error('Error removing all availabilities:', error);
      await Swal.fire({
        icon: 'error',
        title: 'Hata',
        text: 'Müsaitlikler kaldırılırken hata oluştu',
        confirmButtonColor: '#ef4444'
      });
    }
  };

  const weekDays = getWeekDays();
  const today = new Date();
  const todayStr = formatDate(today);

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4 sm:mb-6">
        <Clock className="w-5 sm:w-6 h-5 sm:h-6 flex-shrink-0" />
        <h2 className="text-xl sm:text-2xl font-bold">Müsaitlik Takvimim</h2>
      </div>

      {/* User Info & Expert Selector (for superadmin) */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        {adminUser?.role === 'superadmin' ? (
          <div className="space-y-3">
            <p className="text-sm text-blue-900">
              <span className="font-semibold">{adminUser?.name}</span> olarak oturum açtınız. Tüm IT Uzmanlarının müsaitliklerini yönetebilirsiniz.
            </p>
            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-2">
                IT Uzmanı Seçiniz
              </label>
              <select
                value={selectedExpertId || ''}
                onChange={(e) => {
                  const expertId = parseInt(e.target.value);
                  setSelectedExpertId(expertId);
                  // Don't reset date - keep current date for new expert
                }}
                className="w-full sm:w-auto border-2 border-gray-300 rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition"
              >
                {experts.map((expert) => (
                  <option key={expert.id} value={expert.id}>
                    {expert.name} ({expert.email})
                  </option>
                ))}
              </select>
            </div>
          </div>
        ) : (
          <p className="text-sm text-blue-900">
            <span className="font-semibold">{adminUser?.name}</span> olarak oturum açtınız. Sadece kendi müsaitliğinizi yönetebilirsiniz.
          </p>
        )}
      </div>

      {/* Weekly Calendar View */}
      <div className="bg-white rounded-lg shadow p-4 sm:p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base sm:text-lg font-semibold">Haftalık Takvim</h3>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                const prevWeek = new Date(currentWeekStart);
                prevWeek.setDate(prevWeek.getDate() - 7);
                setCurrentWeekStart(prevWeek);
              }}
              className="p-2 hover:bg-gray-100 rounded-lg transition"
            >
              <ChevronLeft size={20} />
            </button>
            <span className="text-sm font-medium text-gray-700 min-w-[120px] text-center">
              {currentWeekStart.toLocaleDateString('tr-TR', { 
                day: 'numeric', 
                month: 'long' 
              })} - {weekDays[4].toLocaleDateString('tr-TR', { 
                day: 'numeric', 
                month: 'long' 
              })}
            </span>
            <button
              onClick={() => {
                const nextWeek = new Date(currentWeekStart);
                nextWeek.setDate(nextWeek.getDate() + 7);
                setCurrentWeekStart(nextWeek);
              }}
              className="p-2 hover:bg-gray-100 rounded-lg transition"
            >
              <ChevronRight size={20} />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-5 gap-2 sm:gap-4">
          {weekDays.map((date, idx) => {
            const dateStr = formatDate(date);
            const isSelected = selectedDate === dateStr;
            const isToday = dateStr === todayStr;
            const dayOfWeek = getDayOfWeek(date);
            const dayName = dayNames[dayOfWeek];
            const isPast = dateStr < todayStr;

            // Count appointments for this day
            const dayAppointments = appointments.filter(apt => apt.date === dateStr && apt.status === 'approved');

            // Count availabilities for this date
            const dayAvailabilities = availabilities.filter(a => a.availabilityDate === dateStr);
            
            return (
              <div key={idx} className="relative">
                <button
                  onClick={() => handleDateSelect(date)}
                  className={`w-full p-3 sm:p-4 rounded-lg border-2 transition text-center ${
                    isSelected
                      ? 'border-blue-500 bg-blue-50'
                      : isToday
                      ? 'border-green-500 bg-green-50'
                      : isPast
                      ? 'border-gray-300 bg-gray-100 opacity-60'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="text-xs sm:text-sm font-medium text-gray-600 mb-1">
                    {dayName}
                  </div>
                  <div className={`text-lg sm:text-xl font-bold ${
                    isSelected ? 'text-blue-600' : isToday ? 'text-green-600' : isPast ? 'text-gray-400' : 'text-gray-900'
                  }`}>
                    {date.getDate()}
                  </div>
                  {dayAppointments.length > 0 && (
                    <div className="mt-1 text-xs text-blue-600 font-medium">
                      {dayAppointments.length} Randevu
                    </div>
                  )}
                  {dayAvailabilities.length > 0 && !isPast && (
                    <div className="mt-1 text-xs text-green-600 font-medium">
                      {dayAvailabilities.length} Müsaitlik
                    </div>
                  )}
                </button>
                {!isPast && dayAvailabilities.length > 0 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRemoveAllForDay(date);
                    }}
                    className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs hover:bg-red-600 transition"
                    title="Tüm müsaitlikleri kaldır"
                  >
                    ×
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Selected Date Info and Time Slots */}
      {selectedDate && (
        <div className="bg-white rounded-lg shadow p-4 sm:p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-base sm:text-lg font-semibold mb-1">
                {formatDateDisplay(selectedDate)}
                {adminUser?.role === 'superadmin' && selectedExpertId && (
                  <span className="text-sm font-normal text-gray-600 ml-2">
                    - {experts.find(e => e.id === selectedExpertId)?.name || 'IT Uzmanı'}
                  </span>
                )}
              </h3>
              <p className="text-sm text-gray-600">
                Seçilen tarih için saatleri ayarlayabilirsiniz
              </p>
            </div>
            <button
              onClick={handleShowAppointments}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm font-medium flex items-center gap-2"
            >
              <Calendar size={16} />
              Randevuları Gör ({appointments.filter(a => a.status === 'approved').length})
            </button>
          </div>

          {/* Time Slots Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 sm:gap-3">
            {TIME_SLOTS.map((timeSlot) => {
              const isAvailable = isTimeSlotAvailable(timeSlot);
              const isBooked = isTimeSlotBooked(timeSlot);
              const appointment = getAppointmentForTimeSlot(timeSlot);
              const isPast = isTimeSlotPast(selectedDate, timeSlot);
              
              return (
                <div
                  key={timeSlot}
                  className={`relative p-3 rounded-lg border-2 transition ${
                    isPast
                      ? 'border-gray-300 bg-gray-100 opacity-60'
                      : isBooked
                      ? 'border-red-500 bg-red-50'
                      : isAvailable
                      ? 'border-green-500 bg-green-50'
                      : 'border-gray-200 bg-gray-50'
                  }`}
                >
                  <div className="text-center">
                    <div className={`text-sm sm:text-base font-semibold mb-1 ${
                      isPast ? 'text-gray-400' : 'text-gray-900'
                    }`}>
                      {timeSlot}
                    </div>
                    {isPast && (
                      <div className="text-xs text-gray-500 font-medium mb-2">
                        Süre Geçti
                      </div>
                    )}
                    {!isPast && isBooked && appointment && (
                      <div className="text-xs text-red-700 font-medium mb-2">
                        Randevulu - Meşgul
                      </div>
                    )}
                    {!isPast && isAvailable && !isBooked && (
                      <div className="text-xs text-green-700 font-medium mb-2">
                        Müsait
                      </div>
                    )}
                    {!isPast && !isAvailable && !isBooked && (
                      <div className="text-xs text-gray-500 mb-2">
                        Müsait Değil
                      </div>
                    )}
                    
                    {!isBooked && !isPast && (
                      <button
                        onClick={() => 
                          isAvailable 
                            ? handleRemoveTimeSlot(timeSlot)
                            : handleAddTimeSlot(timeSlot)
                        }
                        className={`w-full py-1.5 px-2 rounded text-xs font-medium transition ${
                          isAvailable
                            ? 'bg-red-100 text-red-700 hover:bg-red-200'
                            : 'bg-green-100 text-green-700 hover:bg-green-200'
                        }`}
                      >
                        {isAvailable ? 'Kaldır' : 'Ekle'}
                      </button>
                    )}
                    {isPast && (
                      <div className="w-full py-1.5 px-2 rounded text-xs font-medium text-gray-400 bg-gray-100">
                        Düzenlenemez
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Appointments Modal */}
      {showAppointmentsModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl sm:text-2xl font-bold text-gray-900">
                  {formatDateDisplay(selectedDate)} - Randevular
                </h2>
                <button
                  onClick={() => setShowAppointmentsModal(false)}
                  className="text-gray-400 hover:text-gray-600 text-2xl font-bold"
                >
                  ×
                </button>
              </div>

              {loadingAppointments ? (
                <div className="text-center py-8 text-gray-500">Yükleniyor...</div>
              ) : selectedDateAppointments.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  Bu tarihte onaylı randevu bulunmamaktadır.
                </div>
              ) : (
                <div className="space-y-3">
                  {selectedDateAppointments.map((apt) => (
                    <div key={apt.id} className="border-2 border-gray-200 rounded-lg p-4">
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                        <div className="flex-1">
                          <p className="font-semibold text-gray-900">{apt.user_name}</p>
                          <p className="text-sm text-gray-600">{apt.user_email}</p>
                          <p className="text-sm text-gray-600">{apt.user_phone}</p>
                          {apt.ticket_no && (
                            <p className="text-sm text-gray-600 font-mono">Ticket: {apt.ticket_no}</p>
                          )}
                          <p className="text-sm text-gray-600 font-medium mt-1">
                            {apt.time.substring(0, 5)}
                          </p>
                        </div>
                        <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800">
                          Onaylı
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
