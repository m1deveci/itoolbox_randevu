import React, { useState, useEffect } from 'react';
import { Clock, Plus, Trash2, AlertCircle, CheckCircle } from 'lucide-react';

interface Availability {
  id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
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
  { start: '09:00', end: '10:00' },
  { start: '10:00', end: '11:00' },
  { start: '13:00', end: '14:00' },
  { start: '14:00', end: '15:00' },
  { start: '15:00', end: '16:00' }
];

export function AvailabilityManager({ adminUser }: Props) {
  const [availabilities, setAvailabilities] = useState<Availability[]>([]);
  const [newAvailability, setNewAvailability] = useState({
    dayOfWeek: 1,
    timeSlot: 0
  });
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const dayNames = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma'];

  useEffect(() => {
    loadAvailabilities();
  }, []);

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

  const handleAddAvailability = async () => {
    try {
      if (!adminUser) {
        setMessage({ type: 'error', text: 'Admin bilgisi bulunamadı' });
        return;
      }

      const slot = TIME_SLOTS[newAvailability.timeSlot];
      const requestBody = {
        expertId: adminUser.id,
        dayOfWeek: newAvailability.dayOfWeek,
        startTime: slot.start,
        endTime: slot.end,
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
        setMessage({ type: 'error', text: data.error || 'Müsaitlik eklenirken hata oluştu' });
        return;
      }

      setAvailabilities([
        ...availabilities,
        {
          id: data.id.toString(),
          dayOfWeek: data.dayOfWeek,
          startTime: data.startTime,
          endTime: data.endTime
        }
      ]);

      setMessage({ type: 'success', text: 'Müsaitlik başarıyla eklendi' });
      setTimeout(() => setMessage(null), 3000);
    } catch (error) {
      console.error('Error adding availability:', error);
      setMessage({ type: 'error', text: 'Müsaitlik eklenirken hata oluştu' });
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
      setMessage({ type: 'success', text: 'Müsaitlik silindi' });
      setTimeout(() => setMessage(null), 3000);
    } catch (error) {
      console.error('Error deleting availability:', error);
      setMessage({ type: 'error', text: 'Müsaitlik silinirken hata oluştu' });
    }
  };

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

      {/* Message */}
      {message && (
        <div
          className={`flex items-center gap-3 p-4 rounded-lg ${
            message.type === 'success'
              ? 'bg-green-50 border border-green-200'
              : 'bg-red-50 border border-red-200'
          }`}
        >
          {message.type === 'success' ? (
            <CheckCircle className="text-green-600 flex-shrink-0" size={20} />
          ) : (
            <AlertCircle className="text-red-600 flex-shrink-0" size={20} />
          )}
          <p
            className={`text-sm ${
              message.type === 'success' ? 'text-green-700' : 'text-red-700'
            }`}
          >
            {message.text}
          </p>
        </div>
      )}

      {/* Add Availability Form */}
      <div className="bg-white rounded-lg shadow p-4 sm:p-6">
        <h3 className="text-base sm:text-lg font-semibold mb-4">Müsaitlik Ekle</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-2">Gün Seçiniz</label>
            <select
              value={newAvailability.dayOfWeek}
              onChange={(e) => setNewAvailability({ ...newAvailability, dayOfWeek: parseInt(e.target.value) })}
              className="w-full border-2 border-gray-300 rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
            >
              {dayNames.map((day, idx) => (
                <option key={idx} value={idx}>
                  {day}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-900 mb-2">Saat Aralığı</label>
            <select
              value={newAvailability.timeSlot}
              onChange={(e) => setNewAvailability({ ...newAvailability, timeSlot: parseInt(e.target.value) })}
              className="w-full border-2 border-gray-300 rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
            >
              <optgroup label="Sabah (09:00 - 11:00)">
                <option value={0}>09:00 - 10:00</option>
                <option value={1}>10:00 - 11:00</option>
              </optgroup>
              <optgroup label="Öğleden Sonra (13:00 - 16:00)">
                <option value={2}>13:00 - 14:00</option>
                <option value={3}>14:00 - 15:00</option>
                <option value={4}>15:00 - 16:00</option>
              </optgroup>
            </select>
          </div>

          <button
            onClick={handleAddAvailability}
            className="w-full bg-blue-600 text-white font-semibold py-2 rounded-lg hover:bg-blue-700 transition text-sm flex items-center justify-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Müsaitlik Ekle
          </button>
        </div>
      </div>

      {/* Availability List */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="p-4 sm:p-6 border-b border-gray-200">
          <h3 className="text-base sm:text-lg font-semibold">Müsaitliklerim</h3>
        </div>

        {availabilities.length === 0 ? (
          <div className="p-6 text-center text-gray-500">
            <p className="text-sm">Henüz müsaitlik tanımlanmamış. Yukarıdan müsaitlik ekleyin.</p>
          </div>
        ) : (
          <div className="divide-y">
            {/* Desktop Table */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 lg:px-6 py-3 text-left text-sm font-semibold text-gray-900">Gün</th>
                    <th className="px-4 lg:px-6 py-3 text-left text-sm font-semibold text-gray-900">Saat</th>
                    <th className="px-4 lg:px-6 py-3 text-left text-sm font-semibold text-gray-900">İşlem</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {availabilities.map((avail) => (
                    <tr key={avail.id} className="hover:bg-gray-50">
                      <td className="px-4 lg:px-6 py-3 text-sm font-medium text-gray-900">
                        {dayNames[avail.dayOfWeek]}
                      </td>
                      <td className="px-4 lg:px-6 py-3 text-sm font-mono text-gray-600">
                        {avail.startTime} - {avail.endTime}
                      </td>
                      <td className="px-4 lg:px-6 py-3">
                        <button
                          onClick={() => handleDeleteAvailability(avail.id)}
                          className="text-red-600 hover:text-red-800 hover:bg-red-50 p-2 rounded transition"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards */}
            <div className="sm:hidden space-y-3 p-4">
              {availabilities.map((avail) => (
                <div key={avail.id} className="bg-gray-50 rounded-lg p-4 flex justify-between items-start gap-3">
                  <div className="flex-1">
                    <p className="font-semibold text-sm text-gray-900">{dayNames[avail.dayOfWeek]}</p>
                    <p className="text-xs text-gray-600 font-mono mt-1">
                      {avail.startTime} - {avail.endTime}
                    </p>
                  </div>
                  <button
                    onClick={() => handleDeleteAvailability(avail.id)}
                    className="text-red-600 hover:text-red-800 p-2 rounded transition flex-shrink-0"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
