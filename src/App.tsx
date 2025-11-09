import { useState } from 'react';
import { Calendar, Users, Clock, Settings } from 'lucide-react';
import { ExpertManagement } from './components/ExpertManagement';
import { AvailabilityManager } from './components/AvailabilityManager';
import { AppointmentBooking } from './components/AppointmentBooking';
import { AppointmentManagement } from './components/AppointmentManagement';

type View = 'booking' | 'experts' | 'availability' | 'appointments';

function App() {
  const [view, setView] = useState<View>('booking');
  const [isAdmin, setIsAdmin] = useState(false);

  if (!isAdmin) {
    return (
      <div>
        <AppointmentBooking />
        <button
          onClick={() => setIsAdmin(true)}
          className="fixed bottom-4 right-4 px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition shadow-lg"
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

            {/* Logout Button */}
            <button
              onClick={() => setIsAdmin(false)}
              className="px-2 sm:px-4 py-2 text-xs sm:text-sm text-gray-700 hover:text-gray-900 transition flex-shrink-0 bg-gray-100 hover:bg-gray-200 rounded"
            >
              <span className="hidden sm:inline">Randevu</span>
              <span className="sm:hidden">←</span>
            </button>
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
