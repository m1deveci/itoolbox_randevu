import React, { useState, useEffect } from 'react';
import { Clock, Plus, Trash2, Zap, AlertCircle, CheckCircle, ChevronLeft, ChevronRight } from 'lucide-react';

interface Availability {
  id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  expertName?: string;
  expertId?: number;
}

interface WeekGroup {
  weekLabel: string;
  startDate: Date;
  endDate: Date;
  days: Array<{
    dayName: string;
    dayOfWeek: number;
    date: Date;
    dateString: string;
    availabilities: Availability[];
  }>;
}

export function AvailabilityManager() {
  const [availabilities, setAvailabilities] = useState<Availability[]>([]);
  const [weekOffset, setWeekOffset] = useState(0);
  const [newAvailability, setNewAvailability] = useState({
    dayOfWeek: 1,
    startTime: '09:00',
    endTime: '17:00'
  });
  const [setupLoading, setSetupLoading] = useState(false);
  const [setupMessage, setSetupMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const dayNames = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'];

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  const getWeekDates = (offset: number) => {
    const today = new Date();
    const currentDay = today.getDay();
    // JavaScript'te 0=Pazar, 1=Pazartesi... Biz Pazartesi'yi 0 olarak kullanıyoruz
    // currentDay'i türkçe haftaya çevirelim
    const turkishDay = currentDay === 0 ? 6 : currentDay - 1; // 0=Pazartesi

    const mondayOfThisWeek = new Date(today);
    mondayOfThisWeek.setDate(today.getDate() - turkishDay);

    const startDate = new Date(mondayOfThisWeek);
    startDate.setDate(startDate.getDate() + offset * 7);

    const days = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date(startDate);
      date.setDate(startDate.getDate() + i);
      days.push(date);
    }

    return { startDate: days[0], endDate: days[6], allDates: days };
  };

  const getWeekLabel = () => {
    const { startDate, endDate } = getWeekDates(weekOffset);
    if (weekOffset === 0) {
      return 'Bu Hafta';
    } else if (weekOffset === 1) {
      return 'Önümüzdeki Hafta';
    } else if (weekOffset === -1) {
      return 'Geçen Hafta';
    } else {
      return `${formatDate(startDate)} - ${formatDate(endDate)}`;
    }
  };

  const groupAvailabilitiesByWeek = (): WeekGroup => {
    const { startDate, endDate, allDates } = getWeekDates(weekOffset);

    const days = allDates.map((date, index) => {
      const dayOfWeek = index; // 0=Pazartesi, 1=Salı, ..., 6=Pazar
      const dateString = date.toISOString().split('T')[0];

      const dayAvailabilities = availabilities.filter(a => a.dayOfWeek === dayOfWeek);

      return {
        dayName: dayNames[dayOfWeek],
        dayOfWeek,
        date,
        dateString,
        availabilities: dayAvailabilities
      };
    });

    return {
      weekLabel: getWeekLabel(),
      startDate,
      endDate,
      days
    };
  };

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
        endTime: a.end_time,
        expertName: a.expert_name,
        expertId: a.expert_id
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

  const handleAutoSetup = async () => {
    if (!window.confirm('Tüm uzmanlar için Pazartesi-Cuma günleri 09:00-11:00 ve 13:00-16:00 saatleri müsait olarak işaretlenecektir. Devam etmek istediğinize emin misiniz?')) {
      return;
    }

    setSetupLoading(true);
    setSetupMessage(null);

    try {
      const response = await fetch('/api/availability/setup/all-experts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      const data = await response.json();

      if (!response.ok) {
        setSetupMessage({
          type: 'error',
          text: data.error || 'Otomatik kurulum sırasında hata oluştu'
        });
        return;
      }

      // Reload availabilities
      await loadAvailabilities();

      setSetupMessage({
        type: 'success',
        text: `${data.created} müsaitlik başarıyla oluşturuldu`
      });

      setTimeout(() => setSetupMessage(null), 5000);
    } catch (error) {
      console.error('Error during auto-setup:', error);
      setSetupMessage({
        type: 'error',
        text: 'Otomatik kurulum sırasında bir hata oluştu'
      });
    } finally {
      setSetupLoading(false);
    }
  };

  const weekGroup = groupAvailabilitiesByWeek();

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4 sm:mb-6">
        <div className="flex items-center gap-2">
          <Clock className="w-5 sm:w-6 h-5 sm:h-6 flex-shrink-0" />
          <h2 className="text-xl sm:text-2xl font-bold">Müsaitlik Yönetimi</h2>
        </div>
        <button
          onClick={handleAutoSetup}
          disabled={setupLoading}
          className="flex items-center justify-center gap-2 px-4 py-2 bg-indigo-500 text-white rounded hover:bg-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed transition text-sm font-medium"
        >
          <Zap className="w-4 h-4" />
          <span className="hidden sm:inline">Tümü Kur</span>
          <span className="sm:hidden">Kur</span>
        </button>
      </div>

      {/* Setup Message */}
      {setupMessage && (
        <div
          className={`flex items-center gap-3 p-4 rounded-lg ${
            setupMessage.type === 'success'
              ? 'bg-green-50 border border-green-200'
              : 'bg-red-50 border border-red-200'
          }`}
        >
          {setupMessage.type === 'success' ? (
            <CheckCircle className="text-green-600 flex-shrink-0" size={20} />
          ) : (
            <AlertCircle className="text-red-600 flex-shrink-0" size={20} />
          )}
          <p
            className={`text-sm ${
              setupMessage.type === 'success' ? 'text-green-700' : 'text-red-700'
            }`}
          >
            {setupMessage.text}
          </p>
        </div>
      )}

      {/* Week Navigation and Display */}
      <div className="bg-white rounded-lg shadow p-4 sm:p-6">
        <div className="flex items-center justify-between mb-6">
          <button
            onClick={() => setWeekOffset(weekOffset - 1)}
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded transition"
          >
            <ChevronLeft className="w-4 h-4" />
            Önceki
          </button>
          <h3 className="text-base sm:text-lg font-semibold text-center flex-1">
            {weekGroup.weekLabel} <span className="text-sm text-gray-600">({formatDate(weekGroup.startDate)} - {formatDate(weekGroup.endDate)})</span>
          </h3>
          <button
            onClick={() => setWeekOffset(weekOffset + 1)}
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded transition"
          >
            Sonraki
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Week Days Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {weekGroup.days.map((day) => (
            <div key={day.dayOfWeek} className="border border-gray-200 rounded-lg p-3">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="font-semibold text-sm text-gray-900">{day.dayName}</p>
                  <p className="text-xs text-gray-600">{formatDate(day.date)}</p>
                </div>
              </div>
              <div className="space-y-2">
                {day.availabilities.length === 0 ? (
                  <p className="text-xs text-gray-500 italic">Müsaitlik yok</p>
                ) : (
                  day.availabilities.map((avail) => (
                    <div key={avail.id} className="flex items-center justify-between bg-green-50 p-2 rounded">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-mono text-green-700">
                          {avail.startTime}-{avail.endTime}
                        </p>
                        <p className="text-xs text-gray-600 truncate">{avail.expertName}</p>
                      </div>
                      <button
                        onClick={() => handleDeleteAvailability(avail.id)}
                        className="ml-2 text-red-600 hover:text-red-800 hover:bg-red-50 p-1 rounded transition flex-shrink-0"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
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
