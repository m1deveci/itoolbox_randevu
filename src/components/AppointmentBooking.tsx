import React, { useState, useEffect } from 'react';
import { Calendar, Clock, User } from 'lucide-react';

export function AppointmentBooking() {
  const [experts, setExperts] = useState([]);
  const [selectedExpert, setSelectedExpert] = useState('');
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedTime, setSelectedTime] = useState('');
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
    if (!selectedExpert || !selectedDate || !selectedTime) {
      alert('Lütfen tüm alanları doldurunuz');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expertId: parseInt(selectedExpert),
          userName: 'Müşteri',
          selectedDate,
          selectedTime
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
    } catch (error) {
      console.error('Error booking appointment:', error);
      alert('Randevu oluştururken hata oluştu: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-2 mb-6">
        <Calendar className="w-6 h-6" />
        <h2 className="text-2xl font-bold">Randevu Al</h2>
      </div>

      <div className="bg-white rounded-lg shadow p-6 space-y-4">
        <div>
          <label className="block text-sm font-semibold mb-2">Uzman Seçini</label>
          <select
            value={selectedExpert}
            onChange={(e) => setSelectedExpert(e.target.value)}
            className="w-full border rounded px-3 py-2"
          >
            <option value="">-- Uzman Seçiniz --</option>
            {experts.map((expert: any) => (
              <option key={expert.id} value={expert.id}>{expert.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-semibold mb-2">Tarih</label>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="w-full border rounded px-3 py-2"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold mb-2">Saat</label>
          <input
            type="time"
            value={selectedTime}
            onChange={(e) => setSelectedTime(e.target.value)}
            className="w-full border rounded px-3 py-2"
          />
        </div>

        <button
          onClick={handleBook}
          disabled={loading}
          className="w-full bg-blue-500 text-white rounded px-4 py-2 hover:bg-blue-600 disabled:opacity-50"
        >
          {loading ? 'Yükleniyor...' : 'Randevu Al'}
        </button>
      </div>
    </div>
  );
}
