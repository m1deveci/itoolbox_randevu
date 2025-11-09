import React, { useState, useEffect } from 'react';
import { CheckCircle, XCircle, Clock } from 'lucide-react';

interface Appointment {
  id: string;
  expertName: string;
  date: string;
  time: string;
  status: 'pending' | 'approved' | 'cancelled';
}

export function AppointmentManagement() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'cancelled'>('all');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadAppointments();
  }, [filter]);

  const loadAppointments = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filter !== 'all') {
        params.append('status', filter);
      }

      const response = await fetch(`/api/appointments?${params.toString()}`);
      if (!response.ok) throw new Error('Failed to fetch appointments');
      const data = await response.json();

      setAppointments(data.appointments.map((a: any) => ({
        id: a.id.toString(),
        expertName: a.expert_name,
        date: a.date.split('T')[0],
        time: a.time.substring(0, 5),
        status: a.status as 'pending' | 'approved' | 'cancelled'
      })));
    } catch (error) {
      console.error('Error loading appointments:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (id: string) => {
    try {
      const response = await fetch(`/api/appointments/${id}/approve`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' }
      });

      if (!response.ok) throw new Error('Failed to approve appointment');
      setAppointments(appointments.map(a => a.id === id ? { ...a, status: 'approved' } : a));
    } catch (error) {
      console.error('Error approving appointment:', error);
      alert('Randevu onaylanırken hata oluştu');
    }
  };

  const handleCancel = async (id: string) => {
    if (!window.confirm('Bu randevuyu iptal etmek istediğinize emin misiniz?')) {
      return;
    }

    try {
      const response = await fetch(`/api/appointments/${id}/cancel`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' }
      });

      if (!response.ok) throw new Error('Failed to cancel appointment');
      setAppointments(appointments.map(a => a.id === id ? { ...a, status: 'cancelled' } : a));
    } catch (error) {
      console.error('Error cancelling appointment:', error);
      alert('Randevu iptal edilirken hata oluştu');
    }
  };

  const filteredAppointments = filter === 'all'
    ? appointments
    : appointments.filter(a => a.status === filter);

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Randevu Yönetimi</h2>

      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setFilter('all')}
          className={`px-4 py-2 rounded ${
            filter === 'all'
              ? 'bg-blue-500 text-white'
              : 'bg-gray-200 text-gray-800 hover:bg-gray-300'
          }`}
        >
          Tümü
        </button>
        <button
          onClick={() => setFilter('pending')}
          className={`px-4 py-2 rounded ${
            filter === 'pending'
              ? 'bg-blue-500 text-white'
              : 'bg-gray-200 text-gray-800 hover:bg-gray-300'
          }`}
        >
          Beklemede
        </button>
        <button
          onClick={() => setFilter('approved')}
          className={`px-4 py-2 rounded ${
            filter === 'approved'
              ? 'bg-blue-500 text-white'
              : 'bg-gray-200 text-gray-800 hover:bg-gray-300'
          }`}
        >
          Onaylı
        </button>
        <button
          onClick={() => setFilter('cancelled')}
          className={`px-4 py-2 rounded ${
            filter === 'cancelled'
              ? 'bg-blue-500 text-white'
              : 'bg-gray-200 text-gray-800 hover:bg-gray-300'
          }`}
        >
          İptal Edilmiş
        </button>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-100">
              <tr>
                <th className="px-6 py-3 text-left font-semibold">Uzman</th>
                <th className="px-6 py-3 text-left font-semibold">Tarih</th>
                <th className="px-6 py-3 text-left font-semibold">Saat</th>
                <th className="px-6 py-3 text-left font-semibold">Durum</th>
                <th className="px-6 py-3 text-left font-semibold">İşlem</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-4 text-center">Yükleniyor...</td>
                </tr>
              ) : filteredAppointments.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-4 text-center text-gray-500">
                    Randevu bulunamadı
                  </td>
                </tr>
              ) : (
                filteredAppointments.map((apt) => (
                  <tr key={apt.id} className="border-t hover:bg-gray-50">
                    <td className="px-6 py-4">{apt.expertName}</td>
                    <td className="px-6 py-4">{apt.date}</td>
                    <td className="px-6 py-4">{apt.time}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-sm ${
                        apt.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                        apt.status === 'approved' ? 'bg-green-100 text-green-800' :
                        'bg-red-100 text-red-800'
                      }`}>
                        {apt.status === 'pending' && <Clock className="w-4 h-4" />}
                        {apt.status === 'approved' && <CheckCircle className="w-4 h-4" />}
                        {apt.status === 'cancelled' && <XCircle className="w-4 h-4" />}
                        {apt.status === 'pending' ? 'Beklemede' : apt.status === 'approved' ? 'Onaylı' : 'İptal Edilmiş'}
                      </span>
                    </td>
                    <td className="px-6 py-4 space-x-2">
                      {apt.status === 'pending' && (
                        <>
                          <button
                            onClick={() => handleApprove(apt.id)}
                            className="text-green-500 hover:text-green-700 font-semibold"
                          >
                            Onayla
                          </button>
                          <button
                            onClick={() => handleCancel(apt.id)}
                            className="text-red-500 hover:text-red-700 font-semibold"
                          >
                            Red
                          </button>
                        </>
                      )}
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
