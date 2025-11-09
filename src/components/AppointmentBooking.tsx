import React, { useState, useEffect } from 'react';
import { Calendar, Clock, User } from 'lucide-react';

export function AppointmentBooking() {
  const [experts, setExperts] = useState([]);
  const [selectedExpert, setSelectedExpert] = useState('');
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedTime, setSelectedTime] = useState('');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadExperts();
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

  const handleBook = async () => {
    if (!selectedExpert || !selectedDate || !selectedTime || !fullName || !email || !phone) {
      alert('Lütfen tüm alanları doldurunuz');
      return;
    }

    if (!email.includes('@')) {
      alert('Lütfen geçerli bir e-posta adresi giriniz');
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
          userPhone: phone,
          appointmentDate: selectedDate,
          appointmentTime: selectedTime
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to book appointment');
      }

      alert('Randevu başarıyla oluşturuldu!');
      setSelectedExpert('');
      setSelectedDate('');
      setSelectedTime('');
      setFullName('');
      setEmail('');
      setPhone('');
    } catch (error) {
      console.error('Error booking appointment:', error);
      alert('Randevu oluştururken hata oluştu: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setLoading(false);
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

        {/* Booking Form */}
        <div className="bg-white rounded-lg shadow-lg p-6 sm:p-8 space-y-5 sm:space-y-6">
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
              onChange={(e) => setPhone(e.target.value)}
              placeholder="05XX XXX XXXX"
              className="w-full border-2 border-gray-300 rounded-lg px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition"
            />
          </div>

          {/* Expert Selection */}
          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-2">
              Hizmet Alanı Seçiniz <span className="text-red-500">*</span>
            </label>
            <select
              value={selectedExpert}
              onChange={(e) => setSelectedExpert(e.target.value)}
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
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-full border-2 border-gray-300 rounded-lg px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition"
            />
          </div>

          {/* Time Selection */}
          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-2">
              Tercih Ettiğiniz Saat <span className="text-red-500">*</span>
            </label>
            <input
              type="time"
              value={selectedTime}
              onChange={(e) => setSelectedTime(e.target.value)}
              className="w-full border-2 border-gray-300 rounded-lg px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition"
            />
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

        {/* Features */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-8">
          <div className="bg-white rounded-lg shadow p-4 text-center">
            <div className="text-blue-500 text-2xl mb-2">✓</div>
            <p className="text-xs sm:text-sm font-medium text-gray-700">Hızlı İşlem</p>
          </div>
          <div className="bg-white rounded-lg shadow p-4 text-center">
            <div className="text-blue-500 text-2xl mb-2">🛡️</div>
            <p className="text-xs sm:text-sm font-medium text-gray-700">Güvenli</p>
          </div>
          <div className="bg-white rounded-lg shadow p-4 text-center">
            <div className="text-blue-500 text-2xl mb-2">24/7</div>
            <p className="text-xs sm:text-sm font-medium text-gray-700">Her Zaman</p>
          </div>
        </div>
      </div>
    </div>
  );
}
