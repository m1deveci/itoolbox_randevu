import { useState, useEffect } from 'react';
import { Calendar, Users, Clock, Settings } from 'lucide-react';
import { ExpertManagement } from './components/ExpertManagement';
import { AvailabilityManager } from './components/AvailabilityManager';
import { AppointmentBooking } from './components/AppointmentBooking';
import { AppointmentManagement } from './components/AppointmentManagement';
import { AdminLogin } from './components/AdminLogin';

type View = 'booking' | 'experts' | 'availability' | 'appointments';

function App() {
  const [view, setView] = useState<View>('booking');
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminUser, setAdminUser] = useState<any>(null);
  const [showLogin, setShowLogin] = useState(false);

  // Check for saved admin session on mount
  useEffect(() => {
    const savedUser = localStorage.getItem('adminUser');
    if (savedUser) {
      try {
        const user = JSON.parse(savedUser);
        setAdminUser(user);
        setIsAdmin(true);
      } catch (error) {
        localStorage.removeItem('adminUser');
      }
    }
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('adminUser');
    setAdminUser(null);
    setIsAdmin(false);
    setShowLogin(false);
    setView('booking');
  };

  const handleLoginSuccess = (user: any) => {
    setAdminUser(user);
    setIsAdmin(true);
    setShowLogin(false);
  };

  if (showLogin && !isAdmin) {
    return <AdminLogin onLoginSuccess={handleLoginSuccess} />;
  }

  if (!isAdmin) {
    return (
      <div>
        <AppointmentBooking />
        <button
          onClick={() => setShowLogin(true)}
          className="fixed bottom-4 right-4 px-4 py-2 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg hover:from-blue-700 hover:to-blue-800 transition shadow-lg text-sm sm:text-base font-medium"
        >
          Admin Paneli
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navigation */}
      <nav className="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-14 sm:h-16 gap-2">
            {/* Logo */}
            <div className="flex items-center gap-2 min-w-0">
              <Calendar className="text-blue-600 flex-shrink-0" size={24} />
              <span className="hidden sm:inline text-lg sm:text-xl font-bold text-gray-900 truncate">IT Randevu</span>
              <span className="sm:hidden text-sm font-bold text-gray-900 truncate">IT Randevu</span>
            </div>

            {/* Admin Navigation Tabs */}
            <div className="flex gap-1 sm:gap-2 overflow-x-auto flex-1">
              <button
                onClick={() => setView('appointments')}
                className={`inline-flex items-center gap-1 px-2 sm:px-4 py-2 border-b-2 text-xs sm:text-sm font-medium transition whitespace-nowrap ${
                  view === 'appointments'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <Calendar size={16} />
                <span className="hidden sm:inline">Randevular</span>
              </button>
              <button
                onClick={() => setView('experts')}
                className={`inline-flex items-center gap-1 px-2 sm:px-4 py-2 border-b-2 text-xs sm:text-sm font-medium transition whitespace-nowrap ${
                  view === 'experts'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <Users size={16} />
                <span className="hidden sm:inline">Uzmanlar</span>
              </button>
              <button
                onClick={() => setView('availability')}
                className={`inline-flex items-center gap-1 px-2 sm:px-4 py-2 border-b-2 text-xs sm:text-sm font-medium transition whitespace-nowrap ${
                  view === 'availability'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <Clock size={16} />
                <span className="hidden sm:inline">Müsaitlik</span>
              </button>
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
                onClick={handleLogout}
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
        {view === 'appointments' && <AppointmentManagement />}
        {view === 'experts' && <ExpertManagement />}
        {view === 'availability' && <AvailabilityManager />}
      </main>
    </div>
  );
}

export default App;
