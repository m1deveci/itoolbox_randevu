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
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4 sm:mb-6">
        <Clock className="w-5 sm:w-6 h-5 sm:h-6 flex-shrink-0" />
        <h2 className="text-xl sm:text-2xl font-bold">Müsaitlik Yönetimi</h2>
      </div>

      {/* Add Availability Form */}
      <div className="bg-white rounded-lg shadow p-4 sm:p-6">
        <h3 className="text-base sm:text-lg font-semibold mb-4">Yeni Müsaitlik Ekle</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
          <select
            value={newAvailability.dayOfWeek}
            onChange={(e) => setNewAvailability({ ...newAvailability, dayOfWeek: parseInt(e.target.value) })}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
          >
            {dayNames.map((day, idx) => (
              <option key={idx} value={idx}>{day}</option>
            ))}
          </select>
          <input
            type="time"
            value={newAvailability.startTime}
            onChange={(e) => setNewAvailability({ ...newAvailability, startTime: e.target.value })}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
            placeholder="Başlama"
          />
          <input
            type="time"
            value={newAvailability.endTime}
            onChange={(e) => setNewAvailability({ ...newAvailability, endTime: e.target.value })}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
            placeholder="Bitiş"
          />
          <button
            onClick={handleAddAvailability}
            className="col-span-1 sm:col-span-2 lg:col-span-1 bg-blue-500 text-white rounded-lg px-4 py-2 flex items-center justify-center gap-2 hover:bg-blue-600 transition text-sm font-medium"
          >
            <Plus className="w-4 h-4" /> <span className="hidden sm:inline">Ekle</span>
          </button>
        </div>
      </div>

      {/* Availability List - Desktop Table */}
      <div className="hidden md:block bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-100">
              <tr>
                <th className="px-4 lg:px-6 py-3 text-left text-sm font-semibold">Gün</th>
                <th className="px-4 lg:px-6 py-3 text-left text-sm font-semibold">Başlama Saati</th>
                <th className="px-4 lg:px-6 py-3 text-left text-sm font-semibold">Bitiş Saati</th>
                <th className="px-4 lg:px-6 py-3 text-left text-sm font-semibold">İşlem</th>
              </tr>
            </thead>
            <tbody>
              {availabilities.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 lg:px-6 py-4 text-center text-sm text-gray-500">
                    Henüz müsaitlik tanımlanmamış
                  </td>
                </tr>
              ) : (
                availabilities.map((avail) => (
                  <tr key={avail.id} className="border-t hover:bg-gray-50">
                    <td className="px-4 lg:px-6 py-3 text-sm font-medium">{dayNames[avail.dayOfWeek]}</td>
                    <td className="px-4 lg:px-6 py-3 text-sm font-mono text-gray-600">{avail.startTime}</td>
                    <td className="px-4 lg:px-6 py-3 text-sm font-mono text-gray-600">{avail.endTime}</td>
                    <td className="px-4 lg:px-6 py-3">
                      <button
                        onClick={() => handleDeleteAvailability(avail.id)}
                        className="text-red-600 hover:text-red-800 hover:bg-red-50 p-2 rounded transition"
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

      {/* Availability List - Mobile Cards */}
      <div className="md:hidden space-y-3">
        {availabilities.length === 0 ? (
          <div className="text-center py-8 text-sm text-gray-500 bg-white rounded-lg">
            Henüz müsaitlik tanımlanmamış
          </div>
        ) : (
          availabilities.map((avail) => (
            <div key={avail.id} className="bg-white rounded-lg shadow p-4">
              <div className="flex justify-between items-start gap-3">
                <div className="flex-1">
                  <p className="font-semibold text-sm text-gray-900">{dayNames[avail.dayOfWeek]}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded font-mono">
                      {avail.startTime}
                    </span>
                    <span className="text-gray-400">→</span>
                    <span className="text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded font-mono">
                      {avail.endTime}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => handleDeleteAvailability(avail.id)}
                  className="flex-shrink-0 text-red-600 hover:text-red-800 hover:bg-red-50 p-2 rounded transition"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
