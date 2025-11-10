import React, { useState, useEffect } from 'react';
import { Clock, Plus, Trash2, AlertCircle, CheckCircle, Calendar, ChevronLeft, ChevronRight, X } from 'lucide-react';
import Swal from 'sweetalert2';

interface Availability {
  id: string;
  dayOfWeek: number;
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
    
    loadAvailabilities();
  }, []);

  useEffect(() => {
    if (selectedDate) {
      loadAppointmentsForDate(selectedDate);
      loadTimeSlotsForDate(selectedDate);
    }
  }, [selectedDate, availabilities]);

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

  const loadAvailabilities = async () => {
    try {
      if (!adminUser) return;
      const response = await fetch(`/api/availability?expertId=${adminUser.id}`);
      if (!response.ok) throw new Error('Failed to fetch availabilities');
      const data = await response.json();
      setAvailabilities(
        data.map((a: any) => ({
          id: a.id.toString(),
          dayOfWeek: a.day_of_week,
          startTime: a.start_time,
          endTime: a.end_time
        }))
      );
    } catch (error) {
      console.error('Error loading availabilities:', error);
    }
  };

  const loadAppointmentsForDate = async (date: string) => {
    if (!adminUser) return;
    
    setLoadingAppointments(true);
    try {
      const response = await fetch(`/api/appointments?expertId=${adminUser.id}&date=${date}`);
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
    if (!adminUser) return;
    
    try {
      const response = await fetch(`/api/availability?expertId=${adminUser.id}`);
      if (!response.ok) throw new Error('Failed to fetch availabilities');
      const data = await response.json();
      
      const dateObj = new Date(date + 'T00:00:00');
      const dayOfWeek = getDayOfWeek(dateObj);
      
      // Get availability for this day of week
      const dayAvailabilities = data.filter((a: any) => a.day_of_week === dayOfWeek);
      
      // Get all time slots from availabilities (1 hour intervals)
      const availableSlots: string[] = [];
      dayAvailabilities.forEach((avail: any) => {
        const start = new Date(`2000-01-01T${avail.start_time}`);
        const end = new Date(`2000-01-01T${avail.end_time}`);
        
        // Generate hourly slots within availability range
        let current = new Date(start);
        while (current < end) {
          const timeStr = current.toTimeString().substring(0, 5); // "HH:MM"
          // Only add if it's in our TIME_SLOTS list
          if (TIME_SLOTS.includes(timeStr) && !availableSlots.includes(timeStr)) {
            availableSlots.push(timeStr);
          }
          // Add 1 hour
          current.setHours(current.getHours() + 1);
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
    setSelectedDate(dateStr);
    setCurrentWeekStart(getWeekStart(date));
  };

  const handleAddTimeSlot = async (timeSlot: string) => {
    if (!adminUser || !selectedDate) return;
    
    const dateObj = new Date(selectedDate + 'T00:00:00');
    const dayOfWeek = getDayOfWeek(dateObj);
    
    // Find the next time slot (1 hour later)
    const slotIndex = TIME_SLOTS.indexOf(timeSlot);
    const endTime = slotIndex < TIME_SLOTS.length - 1 ? TIME_SLOTS[slotIndex + 1] : '17:00';
    
    // Check if this time slot already exists (exact match or overlap)
    const existing = availabilities.find(
      a => a.dayOfWeek === dayOfWeek && (
        // Exact match
        (a.startTime === timeSlot && a.endTime === endTime) ||
        // Overlap: new slot starts within existing slot
        (a.startTime <= timeSlot && a.endTime > timeSlot) ||
        // Overlap: new slot ends within existing slot
        (a.startTime < endTime && a.endTime >= endTime) ||
        // Overlap: new slot completely contains existing slot
        (a.startTime >= timeSlot && a.endTime <= endTime)
      )
    );
    
    if (existing) {
      await Swal.fire({
        icon: 'info',
        title: 'Zaten Mevcut',
        text: `Bu saat aralığı (${timeSlot}-${endTime}) zaten müsaitlik olarak tanımlı veya mevcut bir müsaitlik ile çakışıyor`,
        confirmButtonColor: '#3b82f6'
      });
      return;
    }

    try {
      const requestBody = {
        expertId: adminUser.id,
        dayOfWeek: dayOfWeek,
        startTime: timeSlot,
        endTime: endTime,
        adminName: adminUser.name,
        adminEmail: adminUser.email
      };

      const response = await fetch('/api/availability', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Müsaitlik eklenirken hata oluştu');
      }

      await loadAvailabilities();
      await loadTimeSlotsForDate(selectedDate);
      
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
    if (!adminUser || !selectedDate) return;
    
    const dateObj = new Date(selectedDate + 'T00:00:00');
    const dayOfWeek = getDayOfWeek(dateObj);
    
    // Find availability that contains this time slot
    const availability = availabilities.find(
      a => a.dayOfWeek === dayOfWeek && 
      a.startTime <= timeSlot && 
      a.endTime > timeSlot
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
        method: 'DELETE' 
      });
      
      if (!response.ok) throw new Error('Failed to delete availability');
      
      await loadAvailabilities();
      await loadTimeSlotsForDate(selectedDate);
      
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
    
    const dateObj = new Date(selectedDate + 'T00:00:00');
    const dayOfWeek = getDayOfWeek(dateObj);
    
    return availabilities.some(
      a => a.dayOfWeek === dayOfWeek && 
      a.startTime <= timeSlot && 
      a.endTime > timeSlot
    );
  };

  const handleShowAppointments = () => {
    const dateAppointments = appointments.filter(apt => apt.status === 'approved');
    setSelectedDateAppointments(dateAppointments);
    setShowAppointmentsModal(true);
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

      {/* User Info */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p className="text-sm text-blue-900">
          <span className="font-semibold">{adminUser?.name}</span> olarak oturum açtınız. Sadece kendi müsaitliğinizi yönetebilirsiniz.
        </p>
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
            
            // Count appointments for this day
            const dayAppointments = appointments.filter(apt => apt.date === dateStr && apt.status === 'approved');
            
            return (
              <button
                key={idx}
                onClick={() => handleDateSelect(date)}
                className={`p-3 sm:p-4 rounded-lg border-2 transition text-center ${
                  isSelected
                    ? 'border-blue-500 bg-blue-50'
                    : isToday
                    ? 'border-green-500 bg-green-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="text-xs sm:text-sm font-medium text-gray-600 mb-1">
                  {dayName}
                </div>
                <div className={`text-lg sm:text-xl font-bold ${
                  isSelected ? 'text-blue-600' : isToday ? 'text-green-600' : 'text-gray-900'
                }`}>
                  {date.getDate()}
                </div>
                {dayAppointments.length > 0 && (
                  <div className="mt-1 text-xs text-blue-600 font-medium">
                    {dayAppointments.length} Randevu
                  </div>
                )}
              </button>
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
              
              return (
                <div
                  key={timeSlot}
                  className={`relative p-3 rounded-lg border-2 transition ${
                    isBooked
                      ? 'border-red-500 bg-red-50'
                      : isAvailable
                      ? 'border-green-500 bg-green-50'
                      : 'border-gray-200 bg-gray-50'
                  }`}
                >
                  <div className="text-center">
                    <div className="text-sm sm:text-base font-semibold text-gray-900 mb-1">
                      {timeSlot}
                    </div>
                    {isBooked && appointment && (
                      <div className="text-xs text-red-700 font-medium mb-2">
                        Randevulu - Meşgul
                      </div>
                    )}
                    {isAvailable && !isBooked && (
                      <div className="text-xs text-green-700 font-medium mb-2">
                        Müsait
                      </div>
                    )}
                    {!isAvailable && !isBooked && (
                      <div className="text-xs text-gray-500 mb-2">
                        Müsait Değil
                      </div>
                    )}
                    
                    {!isBooked && (
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
