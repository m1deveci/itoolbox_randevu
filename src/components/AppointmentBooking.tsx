import React, { useState, useEffect } from 'react';
import { Calendar, Clock, User, Search } from 'lucide-react';
import Swal from 'sweetalert2';

interface Availability {
  id: number;
  expert_id: number;
  day_of_week: number;
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

    // Get day of week (0=Sunday, 1=Monday, ..., 6=Saturday)
    const date = new Date(selectedDate + 'T00:00:00');
    const jsDayOfWeek = date.getDay(); // 0=Pazar, 1=Pazartesi, ..., 6=Cumartesi
    // Convert to our format: 0=Pazartesi, 1=Salı, ..., 6=Pazar
    const dayOfWeek = jsDayOfWeek === 0 ? 6 : jsDayOfWeek - 1;

    // Filter availabilities for this day of week
    const dayAvailabilities = availabilities.filter(
      (avail) => avail.day_of_week === dayOfWeek
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
    const uniqueSlots = [...new Set(timeSlots)].sort();
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
        const error = await response.json();
        throw new Error(error.error || 'Failed to book appointment');
      }

      await Swal.fire({
        icon: 'success',
        title: 'Randevu Başarılı!',
        text: 'Randevunuz başarıyla oluşturuldu. En kısa sürede onaylanacaktır.',
        confirmButtonColor: '#3b82f6',
        confirmButtonText: 'Tamam'
      });

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
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4 sm:p-6 lg:p-8 flex items-center">
      <div className="w-full max-w-2xl mx-auto">
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
        <div className="bg-white rounded-lg shadow-lg p-6 sm:p-8">
          {/* Progress Indicator */}
          <div className="mb-6">
            <div className="flex items-center justify-center gap-2 mb-4">
              <div className={`flex items-center ${currentStep >= 1 ? 'text-blue-600' : 'text-gray-400'}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-semibold ${
                  currentStep >= 1 ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500'
                }`}>
                  1
                </div>
                <span className="ml-2 text-sm font-medium hidden sm:inline">Kişisel Bilgiler</span>
              </div>
              <div className={`w-12 h-1 ${currentStep >= 2 ? 'bg-blue-600' : 'bg-gray-200'}`}></div>
              <div className={`flex items-center ${currentStep >= 2 ? 'text-blue-600' : 'text-gray-400'}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-semibold ${
                  currentStep >= 2 ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500'
                }`}>
                  2
                </div>
                <span className="ml-2 text-sm font-medium hidden sm:inline">Randevu Detayları</span>
              </div>
            </div>
          </div>

          {/* Step 1: Personal Information */}
          {currentStep === 1 && (
            <div className="space-y-5 sm:space-y-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Kişisel Bilgileriniz</h3>
              
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
            <div className="space-y-5 sm:space-y-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">Randevu Detayları</h3>
                <button
                  onClick={() => setCurrentStep(1)}
                  className="text-sm text-gray-600 hover:text-gray-900"
                >
                  ← Geri
                </button>
              </div>

              {/* Ticket Info */}
              <div className="bg-blue-50 border-l-4 border-blue-500 p-4 rounded">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0">
                    <svg className="w-5 h-5 text-blue-500 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm text-blue-800 font-medium mb-1">
                      Önemli: Randevu almadan önce Ravago SSP üzerinden Ticket açılması gerekmektedir.
                    </p>
                    <a
                      href="https://itservice.ravago.com"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-blue-600 hover:text-blue-800 underline font-medium"
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

      {/* Status Check Modal */}
      {showStatusModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
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
                <div className="flex gap-2">
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
                    className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition font-medium text-sm"
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
                      <div key={apt.id} className="border-2 border-gray-200 rounded-lg p-4">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                          <div className="flex-1">
                            <p className="font-semibold text-gray-900">{apt.user_name}</p>
                            <p className="text-sm text-gray-600">{apt.expert_name}</p>
                            {apt.ticket_no && (
                              <p className="text-sm text-gray-600 font-mono">Ticket: {apt.ticket_no}</p>
                            )}
                            <p className="text-sm text-gray-600">
                              {new Date(apt.date).toLocaleDateString('tr-TR', {
                                year: 'numeric',
                                month: 'long',
                                day: 'numeric'
                              })} - {apt.time.substring(0, 5)}
                            </p>
                            {apt.status === 'cancelled' && apt.cancellation_reason && (
                              <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-sm">
                                <p className="font-medium text-red-800 mb-1">İptal Sebebi:</p>
                                <p className="text-red-700">{apt.cancellation_reason}</p>
                              </div>
                            )}
                          </div>
                          <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(apt.status)}`}>
                            {getStatusText(apt.status)}
                          </span>
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
