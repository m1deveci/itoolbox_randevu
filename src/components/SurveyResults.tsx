import React, { useState, useEffect } from 'react';
import { Star, TrendingUp } from 'lucide-react';

interface Survey {
  id: number;
  appointment_id: number;
  user_email: string;
  service_satisfaction: number;
  system_satisfaction: number;
  problem_description: string | null;
  created_at: string;
  user_name: string;
  ticket_no: string;
  appointment_date: string;
  appointment_time: string;
}

interface Statistics {
  total_surveys: number;
  avg_service_satisfaction: number;
  avg_system_satisfaction: number;
}

export function SurveyResults() {
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [statistics, setStatistics] = useState<Statistics | null>(null);
  const [loading, setLoading] = useState(true);
  const [filterRating, setFilterRating] = useState(0);

  useEffect(() => {
    loadSurveys();
  }, []);

  const loadSurveys = async () => {
    setLoading(true);
    try {
      const [surveysRes, statsRes] = await Promise.all([
        fetch('/api/surveys'),
        fetch('/api/surveys/stats/summary')
      ]);

      if (surveysRes.ok) {
        const data = await surveysRes.json();
        setSurveys(data.surveys || []);
      }

      if (statsRes.ok) {
        const data = await statsRes.json();
        setStatistics(data.statistics);
      }
    } catch (error) {
      console.error('Error loading surveys:', error);
    } finally {
      setLoading(false);
    }
  };

  const renderStars = (rating: number) => {
    return (
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <Star
            key={star}
            size={16}
            className={star <= rating ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'}
          />
        ))}
      </div>
    );
  };

  const filteredSurveys = filterRating === 0
    ? surveys
    : surveys.filter(s => s.service_satisfaction === filterRating || s.system_satisfaction === filterRating);

  if (loading) {
    return (
      <div className="text-center py-8 text-gray-500">Anket sonuçları yükleniyor...</div>
    );
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-900">Anket Sonuçları</h2>

      {/* Statistics Cards */}
      {statistics && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Total Surveys */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center gap-4">
              <div className="bg-blue-100 p-3 rounded-lg">
                <TrendingUp className="text-blue-600" size={24} />
              </div>
              <div>
                <p className="text-sm text-gray-600">Toplam Anket</p>
                <p className="text-2xl font-bold text-gray-900">{statistics.total_surveys}</p>
              </div>
            </div>
          </div>

          {/* Service Satisfaction */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex flex-col gap-3">
              <p className="text-sm text-gray-600">Telefon Değişim Hizmetinden Memnuniyet</p>
              <div className="flex items-center gap-3">
                <p className="text-3xl font-bold text-yellow-500">
                  {statistics.avg_service_satisfaction.toFixed(1)}
                </p>
                <span className="text-gray-600">/5.0</span>
              </div>
              <div className="flex gap-1">
                {renderStars(Math.round(statistics.avg_service_satisfaction))}
              </div>
            </div>
          </div>

          {/* System Satisfaction */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex flex-col gap-3">
              <p className="text-sm text-gray-600">Randevu Sisteminden Memnuniyet</p>
              <div className="flex items-center gap-3">
                <p className="text-3xl font-bold text-yellow-500">
                  {statistics.avg_system_satisfaction.toFixed(1)}
                </p>
                <span className="text-gray-600">/5.0</span>
              </div>
              <div className="flex gap-1">
                {renderStars(Math.round(statistics.avg_system_satisfaction))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Filter Buttons */}
      <div className="bg-white rounded-lg shadow p-4">
        <p className="text-sm font-semibold text-gray-700 mb-3">Puana Göre Filtrele:</p>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setFilterRating(0)}
            className={`px-4 py-2 rounded-lg font-medium transition ${
              filterRating === 0
                ? 'bg-blue-500 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Tümü ({surveys.length})
          </button>
          {[1, 2, 3, 4, 5].map((rating) => (
            <button
              key={rating}
              onClick={() => setFilterRating(rating)}
              className={`px-4 py-2 rounded-lg font-medium transition flex items-center gap-2 ${
                filterRating === rating
                  ? 'bg-yellow-400 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {rating} ⭐ ({surveys.filter(
                s => s.service_satisfaction === rating || s.system_satisfaction === rating
              ).length})
            </button>
          ))}
        </div>
      </div>

      {/* Surveys Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {filteredSurveys.length === 0 ? (
          <div className="text-center py-8 text-gray-500">Anket sonucu bulunamadı</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-100">
                <tr>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Kullanıcı</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Randevu Tarihi</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Ticket No</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Hizmet Puanı</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Sistem Puanı</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Sorun</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Tarih</th>
                </tr>
              </thead>
              <tbody>
                {filteredSurveys.map((survey) => (
                  <tr key={survey.id} className="border-t hover:bg-gray-50 transition">
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <p className="text-sm font-medium text-gray-900">{survey.user_name}</p>
                        <p className="text-xs text-gray-600">{survey.user_email}</p>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {survey.appointment_date} {survey.appointment_time}
                    </td>
                    <td className="px-6 py-4 text-sm font-mono text-gray-600">{survey.ticket_no}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-gray-900 min-w-[2rem]">
                          {survey.service_satisfaction}/5
                        </span>
                        {renderStars(survey.service_satisfaction)}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-gray-900 min-w-[2rem]">
                          {survey.system_satisfaction}/5
                        </span>
                        {renderStars(survey.system_satisfaction)}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {survey.problem_description ? (
                        <div
                          className="text-xs text-gray-600 max-w-xs truncate"
                          title={survey.problem_description}
                        >
                          {survey.problem_description}
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">Sorun yok</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-xs text-gray-500">
                      {new Date(survey.created_at).toLocaleDateString('tr-TR')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Info Message */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p className="text-sm text-blue-900">
          💡 <strong>İpucu:</strong> Anketler randevu tamamlandığında otomatik olarak gönderilen e-posta aracılığıyla toplanıyor.
        </p>
      </div>
    </div>
  );
}
