import React, { useState, useEffect } from 'react';
import { CheckCircle, XCircle, Clock, Trash2 } from 'lucide-react';
import Swal from 'sweetalert2';

interface Appointment {
  id: string;
  userName: string;
  userEmail: string;
  userPhone: string;
  ticketNo?: string;
  expertName: string;
  expertId: number;
  date: string;
  time: string;
  status: 'pending' | 'approved' | 'cancelled';
}

interface AdminUser {
  id: number; // Same ID as expert_id in randevu database
  name: string;
  email: string;
  role: string;
}

interface Props {
  adminUser: AdminUser | null;
}

export function AppointmentManagement({ adminUser }: Props) {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'cancelled' | 'my'>('my');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadAppointments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, adminUser]);

  const loadAppointments = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      
      // adminUser.id is the same as expert_id in randevu database
      const expertId = adminUser?.id;
      
      // If user is not superadmin, only show their own appointments
      if (adminUser && adminUser.role !== 'superadmin' && expertId) {
        params.append('expertId', expertId.toString());
      }
      
      // If filter is 'my', show only current user's appointments
      if (filter === 'my' && adminUser && expertId) {
        params.append('expertId', expertId.toString());
      } else if (filter !== 'all' && filter !== 'my') {
        params.append('status', filter);
      }

      const response = await fetch(`/api/appointments?${params.toString()}`);
      if (!response.ok) throw new Error('Failed to fetch appointments');
      const data = await response.json();

      let mappedAppointments = data.appointments.map((a: any) => ({
        id: a.id.toString(),
        userName: a.user_name,
        userEmail: a.user_email,
        userPhone: a.user_phone,
        ticketNo: a.ticket_no,
        expertName: a.expert_name,
        expertId: a.expert_id,
        date: a.date.split('T')[0],
        time: a.time.substring(0, 5),
        status: a.status as 'pending' | 'approved' | 'cancelled'
      }));

      // If filter is 'my', filter by expert ID client-side as well
      if (filter === 'my' && adminUser) {
        mappedAppointments = mappedAppointments.filter(a => a.expertId === adminUser.id);
      }

      setAppointments(mappedAppointments);
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
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': adminUser?.id?.toString() || '',
          'x-user-name': encodeURIComponent(adminUser?.name || 'System')
        }
      });

      if (!response.ok) throw new Error('Failed to approve appointment');
      setAppointments(appointments.map(a => a.id === id ? { ...a, status: 'approved' } : a));
    } catch (error) {
      console.error('Error approving appointment:', error);
      alert('Randevu onaylanırken hata oluştu');
    }
  };

  const handleCancel = async (id: string) => {
    const { value: cancellationReason } = await Swal.fire({
      title: 'Randevuyu İptal Et',
      text: 'İptal sebebini giriniz:',
      input: 'textarea',
      inputPlaceholder: 'İptal sebebini buraya yazın...',
      inputAttributes: {
        'aria-label': 'İptal sebebi'
      },
      showCancelButton: true,
      confirmButtonText: 'İptal Et',
      cancelButtonText: 'Vazgeç',
      confirmButtonColor: '#ef4444',
      inputValidator: (value) => {
        if (!value || value.trim().length === 0) {
          return 'İptal sebebi gereklidir!';
        }
        if (value.trim().length < 5) {
          return 'İptal sebebi en az 5 karakter olmalıdır!';
        }
      }
    });

    if (!cancellationReason) {
      return;
    }

    try {
      const response = await fetch(`/api/appointments/${id}/cancel`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': adminUser?.id?.toString() || '',
          'x-user-name': encodeURIComponent(adminUser?.name || 'System')
        },
        body: JSON.stringify({ cancellationReason: cancellationReason.trim() })
      });

      if (!response.ok) throw new Error('Failed to cancel appointment');

      await Swal.fire({
        icon: 'success',
        title: 'Randevu İptal Edildi',
        text: 'Randevu başarıyla iptal edildi.',
        confirmButtonColor: '#3b82f6'
      });

      setAppointments(appointments.map(a => a.id === id ? { ...a, status: 'cancelled' } : a));
    } catch (error) {
      console.error('Error cancelling appointment:', error);
      await Swal.fire({
        icon: 'error',
        title: 'Hata',
        text: 'Randevu iptal edilirken hata oluştu',
        confirmButtonColor: '#ef4444'
      });
    }
  };

  const handleDelete = async (id: string) => {
    const confirmed = await Swal.fire({
      title: 'Randevuyu Sil',
      text: 'Bu randevuyu silmek istediğinizden emin misiniz? Bu işlem geri alınamaz.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Evet, Sil',
      cancelButtonText: 'Vazgeç',
      confirmButtonColor: '#ef4444'
    });

    if (!confirmed.isConfirmed) {
      return;
    }

    try {
      const response = await fetch(`/api/appointments/${id}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': adminUser?.id?.toString() || '',
          'x-user-name': encodeURIComponent(adminUser?.name || 'System')
        }
      });

      if (!response.ok) throw new Error('Failed to delete appointment');

      await Swal.fire({
        icon: 'success',
        title: 'Randevu Silindi',
        text: 'Randevu başarıyla silindi.',
        confirmButtonColor: '#3b82f6'
      });

      setAppointments(appointments.filter(a => a.id !== id));
    } catch (error) {
      console.error('Error deleting appointment:', error);
      await Swal.fire({
        icon: 'error',
        title: 'Hata',
        text: 'Randevu silinirken hata oluştu',
        confirmButtonColor: '#ef4444'
      });
    }
  };

  const filteredAppointments = (() => {
    if (filter === 'all') {
      return appointments;
    } else if (filter === 'my') {
      // Already filtered in loadAppointments, but filter again for safety
      if (adminUser) {
        return appointments.filter(a => a.expertId === adminUser.id);
      }
      return appointments;
    } else {
      return appointments.filter(a => a.status === filter);
    }
  })();

  return (
    <div className="space-y-4 sm:space-y-6">
      <h2 className="text-xl sm:text-2xl font-bold">Randevu Yönetimi</h2>

      {/* Filter Buttons - Mobile Responsive */}
      <div className="flex flex-wrap gap-2 mb-4">
        {[
          { label: 'Benim Randevularım', key: 'my' as const },
          { label: 'Tümü', key: 'all' as const },
          { label: 'Beklemede', key: 'pending' as const },
          { label: 'Onaylı', key: 'approved' as const },
          { label: 'İptal', key: 'cancelled' as const }
        ].map(({ label, key }) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`px-3 sm:px-4 py-1.5 sm:py-2 rounded text-xs sm:text-sm font-medium transition ${
              filter === key
                ? 'bg-blue-500 text-white'
                : 'bg-gray-200 text-gray-800 hover:bg-gray-300'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Appointments Table - Mobile Card View on Small Screens */}

      {loading && (
        <div className="text-center py-8 text-gray-500">Yükleniyor...</div>
      )}

      {!loading && filteredAppointments.length === 0 && (
        <div className="text-center py-8 text-gray-500 bg-white rounded-lg">Randevu bulunamadı</div>
      )}

      {!loading && filteredAppointments.length > 0 && (
        <>
          {/* Desktop Table */}
          <div className="hidden md:block bg-white rounded-lg shadow overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="px-4 lg:px-6 py-3 text-left text-sm font-semibold">Müşteri</th>
                    <th className="px-4 lg:px-6 py-3 text-left text-sm font-semibold">E-posta</th>
                    <th className="px-4 lg:px-6 py-3 text-left text-sm font-semibold">Telefon</th>
                    <th className="px-4 lg:px-6 py-3 text-left text-sm font-semibold">Ticket No</th>
                    <th className="px-4 lg:px-6 py-3 text-left text-sm font-semibold">Uzman</th>
                    <th className="px-4 lg:px-6 py-3 text-left text-sm font-semibold">Tarih</th>
                    <th className="px-4 lg:px-6 py-3 text-left text-sm font-semibold">Saat</th>
                    <th className="px-4 lg:px-6 py-3 text-left text-sm font-semibold">Durum</th>
                    <th className="px-4 lg:px-6 py-3 text-left text-sm font-semibold">İşlem</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAppointments.map((apt) => (
                    <tr key={apt.id} className="border-t hover:bg-gray-50">
                      <td className="px-4 lg:px-6 py-3 text-sm">{apt.userName}</td>
                      <td className="px-4 lg:px-6 py-3 text-sm font-mono text-xs">{apt.userEmail}</td>
                      <td className="px-4 lg:px-6 py-3 text-sm font-mono text-xs">{apt.userPhone}</td>
                      <td className="px-4 lg:px-6 py-3 text-sm font-mono">{apt.ticketNo || '-'}</td>
                      <td className="px-4 lg:px-6 py-3 text-sm">{apt.expertName}</td>
                      <td className="px-4 lg:px-6 py-3 text-sm">{apt.date}</td>
                      <td className="px-4 lg:px-6 py-3 text-sm">{apt.time}</td>
                      <td className="px-4 lg:px-6 py-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${
                          apt.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                          apt.status === 'approved' ? 'bg-green-100 text-green-800' :
                          'bg-red-100 text-red-800'
                        }`}>
                          {apt.status === 'pending' && <Clock className="w-3 h-3" />}
                          {apt.status === 'approved' && <CheckCircle className="w-3 h-3" />}
                          {apt.status === 'cancelled' && <XCircle className="w-3 h-3" />}
                          <span className="hidden sm:inline">{apt.status === 'pending' ? 'Beklemede' : apt.status === 'approved' ? 'Onaylı' : 'İptal'}</span>
                        </span>
                      </td>
                      <td className="px-4 lg:px-6 py-3 space-x-1 sm:space-x-2">
                        {apt.status === 'pending' && (
                          <>
                            <button
                              onClick={() => handleApprove(apt.id)}
                              className="text-xs sm:text-sm text-green-600 hover:text-green-800 font-semibold hover:bg-green-50 px-2 py-1 rounded"
                            >
                              ✓
                            </button>
                            <button
                              onClick={() => handleCancel(apt.id)}
                              className="text-xs sm:text-sm text-red-600 hover:text-red-800 font-semibold hover:bg-red-50 px-2 py-1 rounded"
                            >
                              ✕
                            </button>
                          </>
                        )}
                        {apt.status === 'cancelled' && (
                          <button
                            onClick={() => handleDelete(apt.id)}
                            className="text-xs sm:text-sm text-red-600 hover:text-red-800 font-semibold hover:bg-red-50 px-2 py-1 rounded inline-flex items-center gap-1"
                            title="Sil"
                          >
                            <Trash2 className="w-3 h-3" />
                            <span className="hidden sm:inline">Sil</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile Card View */}
          <div className="md:hidden space-y-3">
            {filteredAppointments.map((apt) => (
              <div key={apt.id} className="bg-white rounded-lg shadow p-4 space-y-3">
                <div className="flex justify-between items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-gray-900">{apt.userName}</p>
                    <p className="text-xs text-gray-600 truncate">{apt.userEmail}</p>
                    <p className="text-xs text-gray-600">{apt.userPhone}</p>
                    {apt.ticketNo && (
                      <p className="text-xs text-gray-600 font-mono">Ticket: {apt.ticketNo}</p>
                    )}
                    <p className="font-medium text-xs text-gray-700 mt-2">{apt.expertName}</p>
                    <p className="text-xs text-gray-600">{apt.date} {apt.time}</p>
                  </div>
                  <span className={`flex-shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${
                    apt.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                    apt.status === 'approved' ? 'bg-green-100 text-green-800' :
                    'bg-red-100 text-red-800'
                  }`}>
                    {apt.status === 'pending' && <Clock className="w-3 h-3" />}
                    {apt.status === 'approved' && <CheckCircle className="w-3 h-3" />}
                    {apt.status === 'cancelled' && <XCircle className="w-3 h-3" />}
                    {apt.status === 'pending' ? 'Beklemede' : apt.status === 'approved' ? 'Onaylı' : 'İptal'}
                  </span>
                </div>

                {apt.status === 'pending' && (
                  <div className="flex gap-2 pt-2">
                    <button
                      onClick={() => handleApprove(apt.id)}
                      className="flex-1 bg-green-50 hover:bg-green-100 text-green-700 text-sm font-semibold py-2 rounded transition"
                    >
                      Onayla
                    </button>
                    <button
                      onClick={() => handleCancel(apt.id)}
                      className="flex-1 bg-red-50 hover:bg-red-100 text-red-700 text-sm font-semibold py-2 rounded transition"
                    >
                      Red
                    </button>
                  </div>
                )}

                {apt.status === 'cancelled' && (
                  <div className="flex gap-2 pt-2">
                    <button
                      onClick={() => handleDelete(apt.id)}
                      className="flex-1 bg-red-50 hover:bg-red-100 text-red-700 text-sm font-semibold py-2 rounded transition inline-flex items-center justify-center gap-2"
                    >
                      <Trash2 className="w-4 h-4" />
                      Sil
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
