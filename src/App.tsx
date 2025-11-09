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
      <nav className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex">
              <div className="flex items-center">
                <Calendar className="text-blue-600" size={28} />
                <span className="ml-2 text-xl font-bold text-gray-900">IT Randevu Sistemi</span>
              </div>
              <div className="ml-10 flex space-x-2">
                <button
                  onClick={() => setView('appointments')}
                  className={`inline-flex items-center px-4 py-2 border-b-2 text-sm font-medium transition ${
                    view === 'appointments'
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <Calendar size={18} className="mr-2" />
                  Randevular
                </button>
                <button
                  onClick={() => setView('experts')}
                  className={`inline-flex items-center px-4 py-2 border-b-2 text-sm font-medium transition ${
                    view === 'experts'
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <Users size={18} className="mr-2" />
                  IT Uzmanları
                </button>
                <button
                  onClick={() => setView('availability')}
                  className={`inline-flex items-center px-4 py-2 border-b-2 text-sm font-medium transition ${
                    view === 'availability'
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <Clock size={18} className="mr-2" />
                  Müsaitlik Yönetimi
                </button>
              </div>
            </div>
            <div className="flex items-center">
              <button
                onClick={() => setIsAdmin(false)}
                className="px-4 py-2 text-sm text-gray-700 hover:text-gray-900 transition"
              >
                Randevu Sayfası
              </button>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {view === 'appointments' && <AppointmentManagement />}
        {view === 'experts' && <ExpertManagement />}
        {view === 'availability' && <AvailabilityManager />}
      </main>
    </div>
  );
}

export default App;
