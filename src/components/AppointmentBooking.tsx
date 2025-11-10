import React, { useState, useEffect } from 'react';
import { Calendar, Clock, User, Search, ExternalLink, Download, ChevronDown } from 'lucide-react';
import Swal from 'sweetalert2';

interface Availability {
  id: number;
  expert_id: number;
  availability_date: string;
  start_time: string;
  end_time: string;
}

export function AppointmentBooking() {
  const [experts, setExperts] = useState([]);
  const [selectedExpert, setSelectedExpert] = useState('');
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedTime, setSelectedTime] = useState('');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');

  // Turkish GSM number mask function
  // Format: (05XX) XXX XX XX (11 digits: 0 + 10 digits)
  const formatPhoneNumber = (value: string): string => {
    // Remove all non-digit characters
    const digits = value.replace(/\D/g, '');
    
    // Limit to 11 digits (0 + 10 digits)
    const limitedDigits = digits.slice(0, 11);
    
    // Apply mask: (05XX) XXX XX XX
    if (limitedDigits.length === 0) return '';
    if (limitedDigits.length <= 1) return limitedDigits;
    if (limitedDigits.length <= 2) return `(${limitedDigits}`;
    if (limitedDigits.length <= 4) return `(${limitedDigits})`;
    if (limitedDigits.length <= 7) return `(${limitedDigits.slice(0, 4)}) ${limitedDigits.slice(4)}`;
    if (limitedDigits.length <= 9) return `(${limitedDigits.slice(0, 4)}) ${limitedDigits.slice(4, 7)} ${limitedDigits.slice(7)}`;
    // Format: (05XX) XXX XX XX (11 digits total)
    return `(${limitedDigits.slice(0, 4)}) ${limitedDigits.slice(4, 7)} ${limitedDigits.slice(7, 9)} ${limitedDigits.slice(9, 11)}`;
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatPhoneNumber(e.target.value);
    setPhone(formatted);
  };
  const [ticketNo, setTicketNo] = useState('');
  const [loading, setLoading] = useState(false);
  const [availabilities, setAvailabilities] = useState<Availability[]>([]);
  const [existingAppointments, setExistingAppointments] = useState<any[]>([]);
  const [availableTimes, setAvailableTimes] = useState<string[]>([]);
  const [loadingAvailability, setLoadingAvailability] = useState(false);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [statusEmail, setStatusEmail] = useState('');
  const [statusAppointments, setStatusAppointments] = useState<any[]>([]);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [showBackupLinks, setShowBackupLinks] = useState(false);
  const [minimumBookingHours, setMinimumBookingHours] = useState(3);
  const [lockSessionId] = useState(() => `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
  const [lockTimeRemaining, setLockTimeRemaining] = useState(0);
  const [previousLockSlot, setPreviousLockSlot] = useState<{ expert: string; date: string; time: string } | null>(null);

  const getTodayDate = () => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  };

  const isWeekend = (dateString: string) => {
    const date = new Date(dateString + 'T00:00:00');
    const day = date.getDay();
    return day === 0 || day === 6; // 0 = Pazar, 6 = Cumartesi
  };

  useEffect(() => {
    loadExperts();
    loadMinimumBookingHours();
    // Set today's date as default
    setSelectedDate(getTodayDate());
  }, []);

  // Load availabilities and appointments when expert or date changes
  useEffect(() => {
    if (selectedExpert && selectedDate) {
      loadAvailabilityAndAppointments();
    } else {
      setAvailableTimes([]);
      setSelectedTime('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedExpert, selectedDate]);

  // Handle time slot locking (90 seconds reservation)
  useEffect(() => {
    // Release previous lock if time changed
    if (previousLockSlot && !(previousLockSlot.expert === selectedExpert && previousLockSlot.date === selectedDate && previousLockSlot.time === selectedTime)) {
      releaseLock(previousLockSlot.expert, previousLockSlot.date, previousLockSlot.time);
    }

    // Create new lock if time is selected
    if (selectedTime && selectedExpert && selectedDate) {
      createLock();
      setLockTimeRemaining(90);
    } else {
      setLockTimeRemaining(0);
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTime]);

  // Countdown timer for lock
  useEffect(() => {
    if (lockTimeRemaining <= 0) return;

    const interval = setInterval(() => {
      setLockTimeRemaining(prev => {
        if (prev <= 1) {
          // Time expired, release lock
          if (selectedExpert && selectedDate && selectedTime) {
            releaseLock(selectedExpert, selectedDate, selectedTime);
            setSelectedTime('');
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [lockTimeRemaining, selectedExpert, selectedDate, selectedTime]);

  // Cleanup lock on component unmount
  useEffect(() => {
    return () => {
      if (selectedExpert && selectedDate && selectedTime) {
        releaseLock(selectedExpert, selectedDate, selectedTime);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const loadMinimumBookingHours = async () => {
    try {
      const response = await fetch('/api/settings/minimum_booking_hours');
      if (!response.ok) {
        // Default to 3 if not found
        setMinimumBookingHours(3);
        return;
      }
      const data = await response.json();
      const hours = parseInt(data.value || '3');
      setMinimumBookingHours(hours);
    } catch (error) {
      console.error('Error loading minimum booking hours:', error);
      // Default to 3 on error
      setMinimumBookingHours(3);
    }
  };

  const createLock = async () => {
    try {
      const response = await fetch('/api/appointments/lock/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expertId: parseInt(selectedExpert),
          appointmentDate: selectedDate,
          appointmentTime: selectedTime,
          sessionId: lockSessionId
        })
      });

      if (!response.ok) {
        const error = await response.json();
        console.error('Error creating lock:', error);
      }

      // Store current slot info for later cleanup
      const expertName = experts.find((e: any) => e.id === parseInt(selectedExpert))?.name || selectedExpert;
      setPreviousLockSlot({
        expert: selectedExpert,
        date: selectedDate,
        time: selectedTime
      });
    } catch (error) {
      console.error('Error creating lock:', error);
    }
  };

  const releaseLock = async (expert: string, date: string, time: string) => {
    try {
      await fetch(`/api/appointments/lock/release/${lockSessionId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      console.error('Error releasing lock:', error);
    }
  };

  const loadAvailabilityAndAppointments = async () => {
    if (!selectedExpert || !selectedDate) return;

    setLoadingAvailability(true);
    try {
      // Load expert's availabilities
      const availResponse = await fetch(`/api/availability?expertId=${selectedExpert}`);
      if (!availResponse.ok) throw new Error('Failed to fetch availability');
      const availData = await availResponse.json();
      setAvailabilities(availData);

      // Load existing appointments for this expert and date
      const apptResponse = await fetch(`/api/appointments?expertId=${selectedExpert}&date=${selectedDate}`);
      if (!apptResponse.ok) throw new Error('Failed to fetch appointments');
      const apptData = await apptResponse.json();
      setExistingAppointments(apptData.appointments || []);

      // Calculate available time slots
      calculateAvailableTimes(availData, apptData.appointments || []);
    } catch (error) {
      console.error('Error loading availability:', error);
      setAvailableTimes([]);
    } finally {
      setLoadingAvailability(false);
    }
  };

  const calculateAvailableTimes = (availabilities: Availability[], appointments: any[]) => {
    if (!selectedDate) return;

    // Filter availabilities for this specific date
    const dayAvailabilities = availabilities.filter(
      (avail) => avail.availability_date === selectedDate
    );

    if (dayAvailabilities.length === 0) {
      setAvailableTimes([]);
      return;
    }

    // Get all booked times for this date
    const bookedTimes = appointments
      .filter((apt) => apt.status !== 'cancelled')
      .map((apt) => apt.time.substring(0, 5)); // Format: "HH:MM"

    // Generate time slots from availabilities (exact startTime matches)
    const timeSlots: string[] = [];

    dayAvailabilities.forEach((avail) => {
      const startTime = avail.start_time.substring(0, 5); // "HH:MM"
      // Only add if not already booked
      if (!bookedTimes.includes(startTime)) {
        timeSlots.push(startTime);
      }
    });

    // Sort and remove duplicates
    let uniqueSlots = [...new Set(timeSlots)].sort();

    // Filter out times that don't meet minimum booking hours requirement
    const todayDate = getTodayDate();
    if (selectedDate === todayDate) {
      const now = new Date();
      const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

      // Calculate minimum booking time (current time + minimum hours)
      const minBookingDate = new Date(now.getTime() + minimumBookingHours * 60 * 60 * 1000);
      const minBookingTime = `${String(minBookingDate.getHours()).padStart(2, '0')}:${String(minBookingDate.getMinutes()).padStart(2, '0')}`;

      // Only show times that are at least minimum booking hours from now
      uniqueSlots = uniqueSlots.filter((slot) => {
        return slot > minBookingTime;
      });
    }

    setAvailableTimes(uniqueSlots);

    // Reset selected time if it's no longer available
    if (selectedTime && !uniqueSlots.includes(selectedTime)) {
      setSelectedTime('');
    }
  };

  const handleTicketNoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.toUpperCase(); // Büyük harfe çevir
    if (value.length <= 10) {
      setTicketNo(value);
    }
  };

  const handleBook = async () => {
    // Remove formatting from phone number for validation
    const phoneDigits = phone.replace(/\D/g, '');
    
    if (!selectedExpert || !selectedDate || !selectedTime || !fullName || !email || !phoneDigits || !ticketNo) {
      await Swal.fire({
        icon: 'warning',
        title: 'Eksik Bilgi',
        text: 'Lütfen tüm alanları doldurunuz',
        confirmButtonColor: '#3b82f6'
      });
      return;
    }

    if (ticketNo.length !== 10) {
      await Swal.fire({
        icon: 'warning',
        title: 'Geçersiz Ticket No',
        text: 'IT Ticket No tam 10 karakter olmalıdır (örn: INC0123456)',
        confirmButtonColor: '#3b82f6'
      });
      return;
    }

    if (!ticketNo.startsWith('INC0')) {
      await Swal.fire({
        icon: 'warning',
        title: 'Geçersiz Ticket No',
        text: 'IT Ticket No INC0 ile başlamalıdır (örn: INC0123456)',
        confirmButtonColor: '#3b82f6'
      });
      return;
    }

    // INC0 sonrası 6 rakam olmalı
    const afterInc0 = ticketNo.substring(4);
    if (!/^\d{6}$/.test(afterInc0)) {
      await Swal.fire({
        icon: 'warning',
        title: 'Geçersiz Ticket No',
        text: 'IT Ticket No formatı: INC0 + 6 rakam (örn: INC0123456)',
        confirmButtonColor: '#3b82f6'
      });
      return;
    }

    if (!email.includes('@')) {
      await Swal.fire({
        icon: 'warning',
        title: 'Geçersiz E-posta',
        text: 'Lütfen geçerli bir e-posta adresi giriniz',
        confirmButtonColor: '#3b82f6'
      });
      return;
    }

    if (isWeekend(selectedDate)) {
      await Swal.fire({
        icon: 'warning',
        title: 'Hafta Sonu Seçilemez',
        text: 'Hafta sonu günlerinde randevu alamazsınız. Lütfen hafta içi bir gün seçiniz.',
        confirmButtonColor: '#3b82f6'
      });
      return;
    }

    setLoading(true);
    try {
      // Check if the time slot is still available (not locked by someone else)
      const lockCheckResponse = await fetch(
        `/api/appointments/lock/check?expertId=${selectedExpert}&date=${selectedDate}&time=${selectedTime}&currentSessionId=${lockSessionId}`
      );

      if (!lockCheckResponse.ok) {
        const lockCheckData = await lockCheckResponse.json();
        await Swal.fire({
          icon: 'warning',
          title: 'Randevu Oluşturulamadı',
          text: lockCheckData.error || 'Başka bir kullanıcı aynı saati seçmiş. Lütfen başka bir saat seçiniz.',
          confirmButtonColor: '#f59e0b'
        });
        return;
      }

      const response = await fetch('/api/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expertId: parseInt(selectedExpert),
          userName: fullName,
          userEmail: email,
          userPhone: phoneDigits,
          ticketNo: ticketNo,
          appointmentDate: selectedDate,
          appointmentTime: selectedTime
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        const errorMessage = errorData.error || 'Randevu oluştururken hata oluştu';

        // Handle different error statuses
        if (response.status === 409) {
          // Conflict - duplicate appointment or time slot already booked
          await Swal.fire({
            icon: 'warning',
            title: 'Randevu Oluşturulamadı',
            text: errorMessage,
            confirmButtonColor: '#f59e0b'
          });
        } else {
          await Swal.fire({
            icon: 'error',
            title: 'Hata',
            text: errorMessage,
            confirmButtonColor: '#ef4444'
          });
        }
        return;
      }

      await Swal.fire({
        icon: 'success',
        title: 'Randevu Başarılı!',
        text: 'Randevunuz başarıyla oluşturuldu. En kısa sürede onaylanacaktır.',
        confirmButtonColor: '#3b82f6',
        confirmButtonText: 'Tamam'
      });

      // Release lock on success
      if (selectedExpert && selectedDate && selectedTime) {
        await releaseLock(selectedExpert, selectedDate, selectedTime);
      }

      setSelectedExpert('');
      setSelectedDate('');
      setSelectedTime('');
      setFullName('');
      setEmail('');
      setPhone('');
      setTicketNo('');
      setCurrentStep(1); // Reset to first step
    } catch (error) {
      console.error('Error booking appointment:', error);
      await Swal.fire({
        icon: 'error',
        title: 'Hata',
        text: 'Randevu oluştururken hata oluştu: ' + (error instanceof Error ? error.message : 'Bilinmeyen hata'),
        confirmButtonColor: '#ef4444'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCheckStatus = async () => {
    if (!statusEmail || !statusEmail.includes('@')) {
      await Swal.fire({
        icon: 'warning',
        title: 'Geçersiz E-posta',
        text: 'Lütfen geçerli bir e-posta adresi giriniz',
        confirmButtonColor: '#3b82f6'
      });
      return;
    }

    setLoadingStatus(true);
    try {
      const response = await fetch(`/api/appointments/by-email/${encodeURIComponent(statusEmail)}`);
      if (!response.ok) throw new Error('Failed to fetch appointments');
      const data = await response.json();
      setStatusAppointments(data.appointments || []);
    } catch (error) {
      console.error('Error checking status:', error);
      await Swal.fire({
        icon: 'error',
        title: 'Hata',
        text: 'Randevu sorgulanırken hata oluştu',
        confirmButtonColor: '#ef4444'
      });
      setStatusAppointments([]);
    } finally {
      setLoadingStatus(false);
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'pending': return 'Beklemede';
      case 'approved': return 'Onaylı';
      case 'cancelled': return 'İptal';
      default: return status;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'approved': return 'bg-green-100 text-green-800';
      case 'cancelled': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4 sm:p-6 lg:p-8">
      <div className="w-full max-w-4xl mx-auto">

        {/* Backup Links Accordion - Top of Page */}
        <div className="mb-8">
          <button
            onClick={() => setShowBackupLinks(!showBackupLinks)}
            className="w-full bg-blue-50 border-2 border-blue-200 rounded-lg p-4 sm:p-6 hover:bg-blue-100 transition flex items-center justify-between"
          >
            <div className="flex items-center gap-3 text-left">
              <Download className="w-5 h-5 text-blue-600 flex-shrink-0" />
              <div>
                <h3 className="text-sm sm:text-base font-semibold text-gray-900">
                  Yedekleme ile İlgili Faydalı Bağlantılar
                </h3>
                <p className="text-xs text-gray-600 mt-1">
                  {showBackupLinks ? 'Gizle' : 'Tıklayarak göster'}
                </p>
              </div>
            </div>
            <ChevronDown
              className={`w-5 h-5 text-blue-600 flex-shrink-0 transition-transform duration-300 ${
                showBackupLinks ? 'rotate-180' : ''
              }`}
            />
          </button>

       {/* Accordion Content */}
{showBackupLinks && (
  <div className="mt-2 bg-white border-2 border-blue-200 border-t-0 rounded-b-lg p-4 sm:p-6 animate-in fade-in duration-200">
    <p className="text-xs sm:text-sm text-gray-600 mb-4">
      Randevu öncesinde verilerinizi yedeklemeniz önerilir. 
      Aşağıdaki bağlantılardan cihazınıza uygun resmi üretici makalelerini inceleyebilirsiniz:
    </p>
    <div className="space-y-2">

      {/* Apple iCloud Yedeği */}
      <a
        href="https://support.apple.com/tr-tr/HT207428"
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800 hover:underline transition p-2 rounded hover:bg-blue-50"
      >
        <ExternalLink className="w-4 h-4 flex-shrink-0" />
        <span>Apple Resmî Makalesi: iCloud ile iPhone Yedekleme</span>
      </a>

      {/* WhatsApp iPhone Yedekleme */}
      <a
        href="https://faq.whatsapp.com/iphone/chats/how-to-back-up-your-chat-history/?lang=tr"
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800 hover:underline transition p-2 rounded hover:bg-blue-50"
      >
        <ExternalLink className="w-4 h-4 flex-shrink-0" />
        <span>WhatsApp Resmî Makalesi: iPhone'da Sohbet Yedeği Alma</span>
      </a>

      {/* Samsung Yedekleme */}
      <a
        href="https://www.samsung.com/tr/support/apps-services/how-to-back-up-data-on-your-galaxy-phone/"
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800 hover:underline transition p-2 rounded hover:bg-blue-50"
      >
        <ExternalLink className="w-4 h-4 flex-shrink-0" />
        <span>Samsung Resmî Makalesi: Galaxy Telefonda Veri Yedekleme</span>
      </a>

    </div>
  </div>
)}

        </div>

        {/* Booking Section */}
        <div className="w-full">
            {/* Header */}
            <div className="text-center mb-8">
              <div className="flex items-center justify-center gap-3 mb-4">
                <div className="bg-blue-500 text-white rounded-full p-3">
                  <Calendar className="w-6 h-6" />
                </div>
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2">IT Uzman Randevusu</h1>
              <p className="text-sm sm:text-base text-gray-600">Uzmanlarımızdan hizmet almak için randevu alınız</p>
            </div>

            {/* Check Status Button */}
            <div className="text-center mb-6">
              <button
                onClick={() => setShowStatusModal(true)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-white text-blue-600 border-2 border-blue-600 rounded-lg hover:bg-blue-50 transition font-medium text-sm sm:text-base"
              >
                <Search size={18} />
                Randevu Durumu Sorgula
              </button>
            </div>

            {/* Booking Form */}
            <div className="bg-white rounded-lg shadow-lg p-4 sm:p-6 lg:p-8">
              {/* Progress Indicator */}
              <div className="mb-6">
                <div className="flex items-center justify-center gap-1 sm:gap-2 mb-4">
                  <div className={`flex items-center ${currentStep >= 1 ? 'text-blue-600' : 'text-gray-400'}`}>
                    <div className={`w-6 sm:w-8 h-6 sm:h-8 rounded-full flex items-center justify-center font-semibold text-xs sm:text-sm ${
                      currentStep >= 1 ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500'
                    }`}>
                      1
                    </div>
                    <span className="ml-1 sm:ml-2 text-xs sm:text-sm font-medium hidden sm:inline">Kişisel</span>
                  </div>
                  <div className={`w-8 sm:w-12 h-1 ${currentStep >= 2 ? 'bg-blue-600' : 'bg-gray-200'}`}></div>
                  <div className={`flex items-center ${currentStep >= 2 ? 'text-blue-600' : 'text-gray-400'}`}>
                    <div className={`w-6 sm:w-8 h-6 sm:h-8 rounded-full flex items-center justify-center font-semibold text-xs sm:text-sm ${
                      currentStep >= 2 ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500'
                    }`}>
                      2
                    </div>
                    <span className="ml-1 sm:ml-2 text-xs sm:text-sm font-medium hidden sm:inline">Detaylar</span>
                  </div>
                </div>
              </div>

              {/* Step 1: Personal Information */}
              {currentStep === 1 && (
                <div className="space-y-4 sm:space-y-5 lg:space-y-6">
                  <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-4">Kişisel Bilgileriniz</h3>
                  
                  {/* Full Name */}
                  <div>
                    <label className="block text-sm font-semibold text-gray-900 mb-2">
                      Adınız Soyadınız <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Adınız ve soyadınız"
                      className="w-full border-2 border-gray-300 rounded-lg px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition"
                    />
                  </div>

                  {/* Email */}
                  <div>
                    <label className="block text-sm font-semibold text-gray-900 mb-2">
                      E-posta Adresiniz <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="ornek@email.com"
                      className="w-full border-2 border-gray-300 rounded-lg px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition"
                    />
                  </div>

                  {/* Phone */}
                  <div>
                    <label className="block text-sm font-semibold text-gray-900 mb-2">
                      Gsm Numaranız <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="tel"
                      value={phone}
                      onChange={handlePhoneChange}
                      placeholder="(05XX) XXX XX XX"
                      maxLength={19}
                      className="w-full border-2 border-gray-300 rounded-lg px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition"
                    />
                  </div>

                  {/* Next Button */}
                  <button
                    onClick={() => {
                      const phoneDigits = phone.replace(/\D/g, '');
                      if (!fullName || !email || !phoneDigits) {
                        Swal.fire({
                          icon: 'warning',
                          title: 'Eksik Bilgi',
                          text: 'Lütfen tüm alanları doldurunuz',
                          confirmButtonColor: '#3b82f6'
                        });
                        return;
                      }
                      if (!email.includes('@')) {
                        Swal.fire({
                          icon: 'warning',
                          title: 'Geçersiz E-posta',
                          text: 'Lütfen geçerli bir e-posta adresi giriniz',
                          confirmButtonColor: '#3b82f6'
                        });
                        return;
                      }
                      setCurrentStep(2);
                    }}
                    className="w-full bg-gradient-to-r from-blue-500 to-blue-600 text-white font-semibold py-3 rounded-lg hover:from-blue-600 hover:to-blue-700 transition duration-200 text-sm sm:text-base"
                  >
                    Devam Et →
                  </button>
                </div>
              )}

            {/* Step 2: Appointment Details */}
            {currentStep === 2 && (
              <div className="space-y-4 sm:space-y-5 lg:space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 mb-4">
                  <h3 className="text-base sm:text-lg font-semibold text-gray-900">Randevu Detayları</h3>
                  <button
                    onClick={() => setCurrentStep(1)}
                    className="text-sm text-gray-600 hover:text-gray-900"
                  >
                    ← Geri
                  </button>
                </div>

                {/* Ticket Info */}
                <div className="bg-blue-50 border-l-4 border-blue-500 p-3 sm:p-4 rounded">
                  <div className="flex items-start gap-2 sm:gap-3">
                    <div className="flex-shrink-0">
                      <svg className="w-4 sm:w-5 h-4 sm:h-5 text-blue-500 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <div className="flex-1">
                      <p className="text-xs sm:text-sm text-blue-800 font-medium mb-1">
                        Önemli: Randevu almadan önce Ravago SSP üzerinden Ticket açılması gerekmektedir.
                      </p>
                      <a
                        href="https://itservice.ravago.com"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs sm:text-sm text-blue-600 hover:text-blue-800 underline font-medium break-all"
                      >
                        RAVAGO SSP (itservice.ravago.com) →
                      </a>
                    </div>
                  </div>
                </div>

                {/* IT Ticket No */}
                <div>
                  <label className="block text-sm font-semibold text-gray-900 mb-2">
                    IT Ticket No <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={ticketNo}
                    onChange={handleTicketNoChange}
                    maxLength={10}
                    className="w-full border-2 border-gray-300 rounded-lg px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition font-mono uppercase"
                  />
                </div>

                {/* Expert Selection */}
                <div>
                  <label className="block text-sm font-semibold text-gray-900 mb-2">
                    IT Uzmanınızı Seçiniz <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={selectedExpert}
                    onChange={(e) => {
                      setSelectedExpert(e.target.value);
                      setSelectedTime(''); // Reset time when expert changes
                    }}
                    className="w-full border-2 border-gray-300 rounded-lg px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition"
                  >
                    <option value="">-- Uzman Seçiniz --</option>
                    {experts.map((expert: any) => (
                      <option key={expert.id} value={expert.id}>
                        {expert.name} ({expert.email})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Date Selection */}
                <div>
                  <label className="block text-sm font-semibold text-gray-900 mb-2">
                    Tercih Ettiğiniz Tarih <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    min={getTodayDate()}
                    value={selectedDate}
                    onChange={(e) => {
                      const date = e.target.value;
                      if (isWeekend(date)) {
                        Swal.fire({
                          icon: 'warning',
                          title: 'Hafta Sonu Seçilemez',
                          text: 'Hafta sonu günleri seçilemez. Lütfen Pazartesi-Cuma arasında bir gün seçiniz.',
                          confirmButtonColor: '#3b82f6'
                        });
                        return;
                      }
                      setSelectedDate(date);
                      setSelectedTime(''); // Reset time when date changes
                    }}
                    className="w-full border-2 border-gray-300 rounded-lg px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition"
                  />
                </div>

                {/* Time Selection */}
                <div>
                  <label className="block text-sm font-semibold text-gray-900 mb-2">
                    Tercih Ettiğiniz Saat <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={selectedTime}
                    onChange={(e) => setSelectedTime(e.target.value)}
                    disabled={!selectedExpert || !selectedDate || loadingAvailability || availableTimes.length === 0}
                    className="w-full border-2 border-gray-300 rounded-lg px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition disabled:bg-gray-100 disabled:cursor-not-allowed"
                  >
                    {!selectedExpert || !selectedDate ? (
                      <option value="">Önce uzman ve tarih seçiniz</option>
                    ) : loadingAvailability ? (
                      <option value="">Yükleniyor...</option>
                    ) : availableTimes.length === 0 ? (
                      <option value="">Meşgul - Bu tarihte müsaitlik bulunmamaktadır</option>
                    ) : (
                      <>
                        <option value="">-- Saat Seçiniz --</option>
                        {availableTimes.map((time) => (
                          <option key={time} value={time}>
                            {time}
                          </option>
                        ))}
                      </>
                    )}
                  </select>
                  {selectedExpert && selectedDate && !loadingAvailability && availableTimes.length === 0 && (
                    <p className="mt-2 text-sm text-red-600">
                      ⚠️ Seçilen IT Uzmanı bu tarihte müsaitlik girmemiş veya tüm saatler dolu.
                    </p>
                  )}

                  {/* Lock Countdown Info */}
                  {selectedTime && lockTimeRemaining > 0 && (
                    <div className="mt-3 p-3 bg-blue-50 border-2 border-blue-200 rounded-lg">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex-1">
                          <p className="text-sm font-semibold text-blue-900">
                            Seçilen Tarih ve Saat Korunuyor
                          </p>
                          <p className="text-xs text-blue-700 mt-1">
                            <strong>{selectedDate}</strong> - <strong>{selectedTime}</strong>
                          </p>
                        </div>
                        <div className="flex-shrink-0 text-center">
                          <div className="text-2xl font-bold text-blue-600">{lockTimeRemaining}</div>
                          <p className="text-xs text-blue-600">saniye</p>
                        </div>
                      </div>
                      <p className="text-xs text-blue-600 mt-2">
                        💡 Bu saati 90 saniye içinde rezerve edebilirsiniz. Sonrasında serbest kalacaktır.
                      </p>
                    </div>
                  )}
                </div>

                {/* Submit Button */}
                <button
                  onClick={handleBook}
                  disabled={loading}
                  className="w-full bg-gradient-to-r from-blue-500 to-blue-600 text-white font-semibold py-3 rounded-lg hover:from-blue-600 hover:to-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition duration-200 text-sm sm:text-base"
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      Yükleniyor...
                    </span>
                  ) : (
                    'Randevu Al'
                  )}
                </button>

                {/* Info */}
                <p className="text-xs text-gray-500 text-center">
                  Tüm alanları doldurarak randevu talebinizi gönderin. En kısa sürede onaylanacaktır.
                </p>
              </div>
            )}
            </div>
        </div>
      </div>

      {/* Status Check Modal */}
      {showStatusModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-4 sm:p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Randevu Durumu Sorgula</h2>
                <button
                  onClick={() => {
                    setShowStatusModal(false);
                    setStatusEmail('');
                    setStatusAppointments([]);
                  }}
                  className="text-gray-400 hover:text-gray-600 text-2xl font-bold"
                >
                  ×
                </button>
              </div>

              {/* Email Input */}
              <div className="mb-6">
                <label className="block text-sm font-semibold text-gray-900 mb-2">
                  E-posta Adresiniz
                </label>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="email"
                    value={statusEmail}
                    onChange={(e) => setStatusEmail(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleCheckStatus()}
                    placeholder="ornek@email.com"
                    className="flex-1 border-2 border-gray-300 rounded-lg px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition"
                  />
                  <button
                    onClick={handleCheckStatus}
                    disabled={loadingStatus}
                    className="px-4 sm:px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition font-medium text-sm whitespace-nowrap"
                  >
                    {loadingStatus ? 'Sorgulanıyor...' : 'Sorgula'}
                  </button>
                </div>
              </div>

              {/* Results */}
              {statusAppointments.length > 0 && (
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-gray-900">
                    Randevularınız ({statusAppointments.length})
                  </h3>
                  <div className="space-y-3">
                    {statusAppointments.map((apt: any) => (
                      <div key={apt.id} className="border-2 border-gray-200 rounded-lg p-3 sm:p-4">
                        <div className="flex flex-col gap-3">
                          <div className="flex justify-between items-start gap-2">
                            <div className="flex-1">
                              <p className="font-semibold text-gray-900 text-sm sm:text-base">{apt.user_name}</p>
                              <p className="text-xs sm:text-sm text-gray-600">{apt.expert_name}</p>
                            </div>
                            <span className={`inline-flex items-center px-2 sm:px-3 py-1 rounded-full text-xs sm:text-sm font-medium flex-shrink-0 ${getStatusColor(apt.status)}`}>
                              {getStatusText(apt.status)}
                            </span>
                          </div>
                          {apt.ticket_no && (
                            <p className="text-xs sm:text-sm text-gray-600 font-mono break-all">Ticket: {apt.ticket_no}</p>
                          )}
                          <p className="text-xs sm:text-sm text-gray-600">
                            {new Date(apt.date).toLocaleDateString('tr-TR', {
                              year: 'numeric',
                              month: 'long',
                              day: 'numeric'
                            })} - {apt.time.substring(0, 5)}
                          </p>
                          {apt.status === 'cancelled' && apt.cancellation_reason && (
                            <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-xs sm:text-sm">
                              <p className="font-medium text-red-800 mb-1">İptal Sebebi:</p>
                              <p className="text-red-700">{apt.cancellation_reason}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {!loadingStatus && statusEmail && statusAppointments.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  Bu e-posta adresine kayıtlı randevu bulunamadı.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
