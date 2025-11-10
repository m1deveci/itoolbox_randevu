import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation, Link } from 'react-router-dom';
import { Calendar, Users, Clock, Settings } from 'lucide-react';
import { ExpertManagement } from './components/ExpertManagement';
import { AvailabilityManager } from './components/AvailabilityManager';
import { AppointmentBooking } from './components/AppointmentBooking';
import { AppointmentManagement } from './components/AppointmentManagement';
import { AdminLogin } from './components/AdminLogin';
import { SettingsPage } from './components/SettingsPage';

function AdminLayout({ adminUser, onLogout }: { adminUser: any; onLogout: () => void }) {
  const location = useLocation();

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
              )}
            </div>

            {/* User Info & Logout */}
            <div className="flex items-center gap-2 flex-shrink-0">
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
            <Route path="ayarlar" element={<SettingsPage adminUser={adminUser} />} />
          )}
          <Route path="*" element={<Navigate to="/admin/randevular" replace />} />
        </Routes>
      </main>
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

function AppWrapper() {
  return (
    <BrowserRouter>
      <App />
    </BrowserRouter>
  );
}

export default AppWrapper;
