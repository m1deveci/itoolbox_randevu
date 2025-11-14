import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation, Link, useParams } from 'react-router-dom';
import { Calendar, Users, Clock, Settings, Bell } from 'lucide-react';
import { ExpertManagement } from './components/ExpertManagement';
import { AvailabilityManager } from './components/AvailabilityManager';
import { AppointmentBooking } from './components/AppointmentBooking';
import { AppointmentManagement } from './components/AppointmentManagement';
import { AdminLogin } from './components/AdminLogin';
import { SettingsPage } from './components/SettingsPage';
import { Survey } from './components/Survey';
import { SurveyResults } from './components/SurveyResults';

function AdminLayout({ adminUser, onLogout }: { adminUser: any; onLogout: () => void }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [notificationCount, setNotificationCount] = useState(0);
  const [pendingAppointmentCount, setPendingAppointmentCount] = useState(0);
  const [showNotificationModal, setShowNotificationModal] = useState(false);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loadingNotifications, setLoadingNotifications] = useState(false);
  const [selectedNotification, setSelectedNotification] = useState<any | null>(null);
  const [showNotificationDetail, setShowNotificationDetail] = useState(false);

  // Load pending appointments count for current superadmin
  useEffect(() => {
    const loadPendingCount = async () => {
      if (adminUser?.role !== 'superadmin') return;

      try {
        const response = await fetch(`/api/appointments?status=pending&expertId=${adminUser.id}`);
        if (!response.ok) throw new Error('Failed to fetch appointments');
        const data = await response.json();
        const pendingCount = data.appointments?.filter((a: any) => a.status === 'pending').length || 0;
        setPendingAppointmentCount(pendingCount);
      } catch (error) {
        console.error('Error loading pending count:', error);
      }
    };

    loadPendingCount();
    // Refresh every 30 seconds
    const interval = setInterval(loadPendingCount, 30000);
    return () => clearInterval(interval);
  }, [adminUser]);

  // Load notifications for admin user
  useEffect(() => {
    const loadNotifications = async () => {
      if (!adminUser?.email) return;

      try {
        setLoadingNotifications(true);
        const response = await fetch(`/api/notifications?email=${encodeURIComponent(adminUser.email)}`);
        if (!response.ok) throw new Error('Failed to fetch notifications');
        const data = await response.json();
        setNotifications(data.notifications || []);
        setNotificationCount(data.unreadCount || 0);
      } catch (error) {
        console.error('Error loading notifications:', error);
      } finally {
        setLoadingNotifications(false);
      }
    };

    loadNotifications();
    // Refresh every 30 seconds
    const interval = setInterval(loadNotifications, 30000);
    return () => clearInterval(interval);
  }, [adminUser]);

  // Close notification modal when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (showNotificationModal && !target.closest('.notification-dropdown')) {
        setShowNotificationModal(false);
      }
    };

    if (showNotificationModal) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showNotificationModal]);

  const handleNotificationClick = async (notification: any) => {
    setSelectedNotification(notification);
    setShowNotificationDetail(true);

    // Mark as read if not already read
    if (!notification.is_read) {
      try {
        await fetch(`/api/notifications/${notification.id}/read`, {
          method: 'PUT'
        });
        // Update local state
        setNotifications(notifications.map(n => 
          n.id === notification.id ? { ...n, is_read: true } : n
        ));
        setNotificationCount(Math.max(0, notificationCount - 1));
      } catch (error) {
        console.error('Error marking notification as read:', error);
      }
    }
  };

  const handleMarkAllAsRead = async () => {
    if (!adminUser?.email) return;

    try {
      await fetch('/api/notifications/read-all', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: adminUser.email })
      });
      setNotifications(notifications.map(n => ({ ...n, is_read: true })));
      setNotificationCount(0);
    } catch (error) {
      console.error('Error marking all as read:', error);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navigation */}
      <nav className="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-14 sm:h-16 gap-2">
            {/* Logo */}
            <Link to="/admin/randevular" className="flex items-center gap-2 min-w-0">
              <Calendar className="text-blue-600 flex-shrink-0" size={24} />
              <span className="hidden sm:inline text-lg sm:text-xl font-bold text-gray-900 truncate">IT Randevu</span>
              <span className="sm:hidden text-sm font-bold text-gray-900 truncate">IT Randevu</span>
            </Link>

            {/* Admin Navigation Tabs */}
            <div className="flex gap-1 sm:gap-2 overflow-x-auto flex-1">
              <Link
                to="/admin/randevular"
                className={`inline-flex items-center gap-1 px-2 sm:px-4 py-2 border-b-2 text-xs sm:text-sm font-medium transition whitespace-nowrap ${
                  location.pathname === '/admin/randevular'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <Calendar size={16} />
                <span className="hidden sm:inline">Randevular</span>
              </Link>
              <Link
                to="/admin/uzmanlar"
                className={`inline-flex items-center gap-1 px-2 sm:px-4 py-2 border-b-2 text-xs sm:text-sm font-medium transition whitespace-nowrap ${
                  location.pathname === '/admin/uzmanlar'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <Users size={16} />
                <span className="hidden sm:inline">Uzmanlar</span>
              </Link>
              <Link
                to="/admin/musaitlik"
                className={`inline-flex items-center gap-1 px-2 sm:px-4 py-2 border-b-2 text-xs sm:text-sm font-medium transition whitespace-nowrap ${
                  location.pathname === '/admin/musaitlik'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <Clock size={16} />
                <span className="hidden sm:inline">Müsaitlik</span>
              </Link>
              {adminUser?.role === 'superadmin' && (
                <>
                  <Link
                    to="/admin/anketler"
                    className={`inline-flex items-center gap-1 px-2 sm:px-4 py-2 border-b-2 text-xs sm:text-sm font-medium transition whitespace-nowrap ${
                      location.pathname === '/admin/anketler'
                        ? 'border-blue-500 text-blue-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    📊
                    <span className="hidden sm:inline">Anketler</span>
                  </Link>
                  <Link
                    to="/admin/ayarlar"
                    className={`inline-flex items-center gap-1 px-2 sm:px-4 py-2 border-b-2 text-xs sm:text-sm font-medium transition whitespace-nowrap ${
                      location.pathname === '/admin/ayarlar'
                        ? 'border-blue-500 text-blue-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    <Settings size={16} />
                    <span className="hidden sm:inline">Ayarlar</span>
                  </Link>
                </>
              )}
            </div>

            {/* User Info & Logout */}
            <div className="flex items-center gap-2 flex-shrink-0">
              {/* Notification Bell */}
              <div className="relative notification-dropdown">
                <button
                  onClick={() => setShowNotificationModal(!showNotificationModal)}
                  className="relative p-2 text-gray-600 hover:text-blue-600 transition"
                  title="Bildirimler"
                >
                  <Bell size={18} />
                  {(notificationCount > 0 || (adminUser?.role === 'superadmin' && pendingAppointmentCount > 0)) && (
                    <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-semibold">
                      {notificationCount + (adminUser?.role === 'superadmin' ? pendingAppointmentCount : 0) > 9 
                        ? '9+' 
                        : notificationCount + (adminUser?.role === 'superadmin' ? pendingAppointmentCount : 0)}
                    </span>
                  )}
                </button>

                {/* Notification Dropdown */}
                {showNotificationModal && (
                  <div className="absolute right-0 top-full mt-2 w-80 sm:w-96 bg-white rounded-lg shadow-xl border border-gray-200 z-50 max-h-[500px] overflow-hidden flex flex-col notification-dropdown">
                    <div className="p-4 border-b border-gray-200 flex items-center justify-between">
                      <h3 className="font-semibold text-gray-900">Bildirimler</h3>
                      <div className="flex gap-2">
                        {notificationCount > 0 && (
                          <button
                            onClick={handleMarkAllAsRead}
                            className="text-xs text-blue-600 hover:text-blue-800"
                          >
                            Tümünü Okundu İşaretle
                          </button>
                        )}
                        <button
                          onClick={() => setShowNotificationModal(false)}
                          className="text-gray-400 hover:text-gray-600"
                        >
                          ×
                        </button>
                      </div>
                    </div>
                    <div className="overflow-y-auto flex-1">
                      {loadingNotifications ? (
                        <div className="p-4 text-center text-gray-500 text-sm">Yükleniyor...</div>
                      ) : notifications.length === 0 ? (
                        <div className="p-4 text-center text-gray-500 text-sm">Bildirim bulunmamaktadır</div>
                      ) : (
                        <div className="divide-y divide-gray-100">
                          {notifications.map((notif) => (
                            <button
                              key={notif.id}
                              onClick={() => handleNotificationClick(notif)}
                              className={`w-full text-left p-4 hover:bg-gray-50 transition ${
                                !notif.is_read ? 'bg-blue-50' : ''
                              }`}
                            >
                              <div className="flex items-start gap-3">
                                <div className={`flex-shrink-0 w-2 h-2 rounded-full mt-2 ${
                                  !notif.is_read ? 'bg-blue-500' : 'bg-gray-300'
                                }`} />
                                <div className="flex-1 min-w-0">
                                  <p className={`text-sm font-semibold ${
                                    !notif.is_read ? 'text-gray-900' : 'text-gray-700'
                                  }`}>
                                    {notif.title}
                                  </p>
                                  <p className="text-xs text-gray-600 mt-1 line-clamp-2">
                                    {notif.message}
                                  </p>
                                  <p className="text-xs text-gray-400 mt-1">
                                    {new Date(notif.created_at).toLocaleString('tr-TR', {
                                      day: 'numeric',
                                      month: 'short',
                                      hour: '2-digit',
                                      minute: '2-digit'
                                    })}
                                  </p>
                                </div>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    {adminUser?.role === 'superadmin' && pendingAppointmentCount > 0 && (
                      <div className="p-3 border-t border-gray-200 bg-gray-50">
                        <button
                          onClick={() => {
                            setShowNotificationModal(false);
                            navigate(`/admin/randevular?filter=pending&expertId=${adminUser.id}`);
                          }}
                          className="w-full text-sm text-blue-600 hover:text-blue-800 font-medium"
                        >
                          {pendingAppointmentCount} bekleyen randevu görüntüle →
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div className="hidden sm:block text-right">
                <p className="text-xs font-medium text-gray-900">{adminUser?.name}</p>
                <p className="text-xs text-gray-500">{adminUser?.role === 'superadmin' ? 'Süper Admin' : 'Admin'}</p>
              </div>
              <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center text-white text-sm font-bold">
                {adminUser?.name?.charAt(0).toUpperCase()}
              </div>
              <button
                onClick={onLogout}
                className="px-2 sm:px-4 py-2 text-xs sm:text-sm text-gray-700 hover:text-gray-900 transition bg-gray-100 hover:bg-gray-200 rounded"
              >
                <span className="hidden sm:inline">Çıkış</span>
                <span className="sm:hidden">←</span>
              </button>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-8">
        <Routes>
          <Route path="randevular" element={<AppointmentManagement adminUser={adminUser} />} />
          <Route path="uzmanlar" element={<ExpertManagement />} />
          <Route path="musaitlik" element={<AvailabilityManager adminUser={adminUser} />} />
          {adminUser?.role === 'superadmin' && (
            <>
              <Route path="anketler" element={<SurveyResults />} />
              <Route path="ayarlar" element={<SettingsPage adminUser={adminUser} />} />
            </>
          )}
          <Route path="*" element={<Navigate to="/admin/randevular" replace />} />
        </Routes>
      </main>

      {/* Notification Detail Modal */}
      {showNotificationDetail && selectedNotification && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
          onClick={() => {
            setShowNotificationDetail(false);
            setSelectedNotification(null);
          }}
        >
          <div 
            className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-bold text-gray-900">
                  {selectedNotification.type === 'reschedule_approved' 
                    ? '✅ Randevu Tarih Değişikliği Onaylandı'
                    : '❌ Randevu Tarih Değişikliği Reddedildi'}
                </h3>
                <button
                  onClick={() => {
                    setShowNotificationDetail(false);
                    setSelectedNotification(null);
                  }}
                  className="text-gray-400 hover:text-gray-600 text-2xl font-bold"
                >
                  ×
                </button>
              </div>

              <div className="space-y-4">
                <div className="p-4 bg-gray-50 rounded-lg">
                  <p className="text-sm font-medium text-gray-900 mb-2">
                    {selectedNotification.user_name || 'Randevu Sahibi'}
                  </p>
                  <p className="text-xs text-gray-600">{selectedNotification.user_email || selectedNotification.user_email}</p>
                  {selectedNotification.ticket_no && (
                    <p className="text-xs text-gray-600 mt-1">
                      <strong>Ticket No:</strong> {selectedNotification.ticket_no}
                    </p>
                  )}
                </div>

                <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                  <h4 className="text-sm font-semibold text-gray-900 mb-2">Bildirim Detayı</h4>
                  <p className="text-sm text-gray-700">{selectedNotification.message}</p>
                </div>

                {selectedNotification.data && (() => {
                  try {
                    const data = typeof selectedNotification.data === 'string' 
                      ? JSON.parse(selectedNotification.data) 
                      : selectedNotification.data;
                    
                    return (
                      <div className="space-y-3">
                        {selectedNotification.type === 'reschedule_approved' ? (
                          <>
                            <div className="p-4 bg-red-50 rounded-lg border border-red-200">
                              <h4 className="text-sm font-semibold text-gray-900 mb-2">Eski Randevu</h4>
                              <p className="text-sm text-gray-700">
                                <strong>Tarih:</strong> {data.old_date || selectedNotification.appointment_date}
                              </p>
                              <p className="text-sm text-gray-700">
                                <strong>Saat:</strong> {data.old_time || selectedNotification.appointment_time}
                              </p>
                            </div>
                            <div className="p-4 bg-green-50 rounded-lg border border-green-200">
                              <h4 className="text-sm font-semibold text-gray-900 mb-2">Yeni Randevu</h4>
                              <p className="text-sm text-gray-700">
                                <strong>Tarih:</strong> {data.new_date}
                              </p>
                              <p className="text-sm text-gray-700">
                                <strong>Saat:</strong> {data.new_time}
                              </p>
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="p-4 bg-green-50 rounded-lg border border-green-200">
                              <h4 className="text-sm font-semibold text-gray-900 mb-2">Mevcut Randevu</h4>
                              <p className="text-sm text-gray-700">
                                <strong>Tarih:</strong> {data.current_date || selectedNotification.appointment_date}
                              </p>
                              <p className="text-sm text-gray-700">
                                <strong>Saat:</strong> {data.current_time || selectedNotification.appointment_time}
                              </p>
                            </div>
                            <div className="p-4 bg-red-50 rounded-lg border border-red-200">
                              <h4 className="text-sm font-semibold text-gray-900 mb-2">Reddedilen Öneri</h4>
                              <p className="text-sm text-gray-700">
                                <strong>Tarih:</strong> {data.rejected_new_date}
                              </p>
                              <p className="text-sm text-gray-700">
                                <strong>Saat:</strong> {data.rejected_new_time}
                              </p>
                              {data.reason && (
                                <p className="text-sm text-gray-700 mt-2">
                                  <strong>Sebep:</strong> {data.reason}
                                </p>
                              )}
                            </div>
                          </>
                        )}
                        {data.expert_name && (
                          <div className="p-3 bg-gray-50 rounded-lg">
                            <p className="text-sm text-gray-700">
                              <strong>IT Uzmanı:</strong> {data.expert_name}
                            </p>
                          </div>
                        )}
                      </div>
                    );
                  } catch (e) {
                    return null;
                  }
                })()}

                <div className="pt-4 border-t border-gray-200">
                  <p className="text-xs text-gray-500">
                    <strong>Oluşturulma:</strong> {new Date(selectedNotification.created_at).toLocaleString('tr-TR')}
                  </p>
                  {selectedNotification.read_at && (
                    <p className="text-xs text-gray-500 mt-1">
                      <strong>Okunma:</strong> {new Date(selectedNotification.read_at).toLocaleString('tr-TR')}
                    </p>
                  )}
                </div>

                <div className="flex gap-3 pt-4">
                  <button
                    onClick={() => {
                      setShowNotificationDetail(false);
                      setSelectedNotification(null);
                      setShowNotificationModal(false);
                      navigate(`/admin/randevular`);
                    }}
                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-lg transition"
                  >
                    Randevulara Git
                  </button>
                  <button
                    onClick={() => {
                      setShowNotificationDetail(false);
                      setSelectedNotification(null);
                    }}
                    className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold py-2 px-4 rounded-lg transition"
                  >
                    Kapat
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ProtectedAdminRoute({ adminUser, onLogout, loading }: { adminUser: any; onLogout: () => void; loading: boolean }) {
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-500">Yükleniyor...</div>
      </div>
    );
  }
  if (!adminUser) {
    return <Navigate to="/admin/login" replace />;
  }
  return <AdminLayout adminUser={adminUser} onLogout={onLogout} />;
}

function App() {
  const [adminUser, setAdminUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Check for saved admin session on mount
  useEffect(() => {
    const savedUser = localStorage.getItem('adminUser');
    if (savedUser) {
      try {
        const user = JSON.parse(savedUser);
        setAdminUser(user);
      } catch (error) {
        localStorage.removeItem('adminUser');
      }
    }
    setLoading(false);
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('adminUser');
    setAdminUser(null);
    window.location.href = '/';
  };

  const handleLoginSuccess = (user: any) => {
    setAdminUser(user);
    window.location.href = '/admin/randevular';
  };

  return (
    <Routes>
      <Route path="/" element={<PublicPage />} />
      <Route path="/survey/:appointmentId" element={<SurveyPage />} />
      <Route path="/admin/login" element={<AdminLogin onLoginSuccess={handleLoginSuccess} />} />
      <Route path="/admin/*" element={<ProtectedAdminRoute adminUser={adminUser} onLogout={handleLogout} loading={loading} />} />
    </Routes>
  );
}

function PublicPage() {
  const navigate = useNavigate();
  
  return (
    <div>
      <AppointmentBooking />
      <button
        onClick={() => navigate('/admin/login')}
        className="fixed bottom-4 right-4 px-4 py-2 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg hover:from-blue-700 hover:to-blue-800 transition shadow-lg text-sm sm:text-base font-medium"
      >
        Admin Paneli
      </button>
    </div>
  );
}

function SurveyPage() {
  const { appointmentId } = useParams<{ appointmentId: string }>();

  if (!appointmentId) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-red-600 text-lg">Geçersiz anket bağlantısı</div>
      </div>
    );
  }

  return <Survey appointmentId={appointmentId} />;
}

function AppWrapper() {
  return (
    <BrowserRouter>
      <App />
    </BrowserRouter>
  );
}

export default AppWrapper;
