import React, { useState, useEffect } from 'react';
import { Clock, Plus, Trash2 } from 'lucide-react';

interface Availability {
  id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
}

export function AvailabilityManager() {
  const [availabilities, setAvailabilities] = useState<Availability[]>([]);
  const [newAvailability, setNewAvailability] = useState({
    dayOfWeek: 1,
    startTime: '09:00',
    endTime: '17:00'
  });

  useEffect(() => {
    // TODO: Fetch from API
    loadAvailabilities();
  }, []);

  const loadAvailabilities = async () => {
    try {
      const response = await fetch('/api/availability');
      if (!response.ok) throw new Error('Failed to fetch availabilities');
      const data = await response.json();
      setAvailabilities(data.map((a: any) => ({
        id: a.id.toString(),
        dayOfWeek: a.day_of_week,
        startTime: a.start_time,
        endTime: a.end_time
      })));
    } catch (error) {
      console.error('Error loading availabilities:', error);
    }
  };

  const handleAddAvailability = async () => {
    try {
      if (newAvailability.startTime >= newAvailability.endTime) {
        alert('Başlama saati bitiş saatinden önce olmalıdır');
        return;
      }

      const response = await fetch('/api/availability', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expertId: 1, // Default to first expert for now
          dayOfWeek: newAvailability.dayOfWeek,
          startTime: newAvailability.startTime,
          endTime: newAvailability.endTime
        })
      });

      if (!response.ok) throw new Error('Failed to add availability');
      const data = await response.json();
      setAvailabilities([...availabilities, {
        id: data.id.toString(),
        dayOfWeek: data.dayOfWeek,
        startTime: data.startTime,
        endTime: data.endTime
      }]);
      setNewAvailability({ dayOfWeek: 1, startTime: '09:00', endTime: '17:00' });
    } catch (error) {
      console.error('Error adding availability:', error);
      alert('Müsaitlik eklenirken hata oluştu');
    }
  };

  const handleDeleteAvailability = async (id: string) => {
    if (!window.confirm('Bu müsaitliği silmek istediğinize emin misiniz?')) {
      return;
    }

    try {
      const response = await fetch(`/api/availability/${id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Failed to delete availability');
      setAvailabilities(availabilities.filter(a => a.id !== id));
    } catch (error) {
      console.error('Error deleting availability:', error);
      alert('Müsaitlik silinirken hata oluştu');
    }
  };

  const dayNames = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 mb-6">
        <Clock className="w-6 h-6" />
        <h2 className="text-2xl font-bold">Müsaitlik Yönetimi</h2>
      </div>

      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-4">Yeni Müsaitlik Ekle</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <select
            value={newAvailability.dayOfWeek}
            onChange={(e) => setNewAvailability({ ...newAvailability, dayOfWeek: parseInt(e.target.value) })}
            className="border rounded px-3 py-2"
          >
            {dayNames.map((day, idx) => (
              <option key={idx} value={idx}>{day}</option>
            ))}
          </select>
          <input
            type="time"
            value={newAvailability.startTime}
            onChange={(e) => setNewAvailability({ ...newAvailability, startTime: e.target.value })}
            className="border rounded px-3 py-2"
          />
          <input
            type="time"
            value={newAvailability.endTime}
            onChange={(e) => setNewAvailability({ ...newAvailability, endTime: e.target.value })}
            className="border rounded px-3 py-2"
          />
          <button
            onClick={handleAddAvailability}
            className="bg-blue-500 text-white rounded px-4 py-2 flex items-center gap-2 hover:bg-blue-600"
          >
            <Plus className="w-4 h-4" /> Ekle
          </button>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-100">
              <tr>
                <th className="px-6 py-3 text-left font-semibold">Gün</th>
                <th className="px-6 py-3 text-left font-semibold">Başlama Saati</th>
                <th className="px-6 py-3 text-left font-semibold">Bitiş Saati</th>
                <th className="px-6 py-3 text-left font-semibold">İşlem</th>
              </tr>
            </thead>
            <tbody>
              {availabilities.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-4 text-center text-gray-500">
                    Henüz müsaitlik tanımlanmamış
                  </td>
                </tr>
              ) : (
                availabilities.map((avail) => (
                  <tr key={avail.id} className="border-t hover:bg-gray-50">
                    <td className="px-6 py-4">{dayNames[avail.dayOfWeek]}</td>
                    <td className="px-6 py-4">{avail.startTime}</td>
                    <td className="px-6 py-4">{avail.endTime}</td>
                    <td className="px-6 py-4">
                      <button
                        onClick={() => handleDeleteAvailability(avail.id)}
                        className="text-red-500 hover:text-red-700"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
