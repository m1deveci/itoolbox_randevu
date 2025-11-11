import React, { useState, useEffect } from 'react';
import Swal from 'sweetalert2';
import { Star } from 'lucide-react';

interface SurveyProps {
  appointmentId: string;
}

export function Survey({ appointmentId }: SurveyProps) {
  const [serviceRating, setServiceRating] = useState(0);
  const [systemRating, setSystemRating] = useState(0);
  const [problemDescription, setProblemDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (serviceRating === 0) {
      await Swal.fire({
        icon: 'warning',
        title: 'Uyarı',
        text: 'Lütfen "Telefon Değişim Hizmetinizden memnun kaldınız mı?" sorusuna cevap verin.',
        confirmButtonColor: '#3b82f6'
      });
      return;
    }

    if (systemRating === 0) {
      await Swal.fire({
        icon: 'warning',
        title: 'Uyarı',
        text: 'Lütfen "Randevu Sisteminden memnun kaldınız mı?" sorusuna cevap verin.',
        confirmButtonColor: '#3b82f6'
      });
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/surveys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appointmentId: parseInt(appointmentId),
          serviceSatisfaction: serviceRating,
          systemSatisfaction: systemRating,
          problemDescription: problemDescription || null
        })
      });

      if (!response.ok) throw new Error('Failed to submit survey');

      setSubmitted(true);
      await Swal.fire({
        icon: 'success',
        title: 'Teşekkür Ederiz!',
        text: 'Anketiniz başarıyla kaydedilmiştir. Görüşleriniz bizim için çok değerlidir.',
        confirmButtonColor: '#3b82f6'
      });
    } catch (error) {
      console.error('Error submitting survey:', error);
      await Swal.fire({
        icon: 'error',
        title: 'Hata',
        text: 'Anket gönderilirken bir hata oluştu. Lütfen tekrar deneyin.',
        confirmButtonColor: '#ef4444'
      });
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-xl p-8 max-w-md w-full text-center">
          <div className="text-6xl mb-4">✓</div>
          <h2 className="text-2xl font-bold text-green-600 mb-4">Anketi Tamamladınız!</h2>
          <p className="text-gray-600 mb-6">
            Anketiniz başarıyla kaydedilmiştir. Görüşleriniz bizim hizmetlerimizi geliştirmemize yardımcı olacaktır.
          </p>
          <p className="text-sm text-gray-500">İyi günlerde kullanmanız dileğiyle...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-lg p-8 mb-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Hizmet Anketi</h1>
          <p className="text-gray-600">
            Telefon Değişim Hizmetimiz ve Randevu Sistemimiz hakkındaki düşüncelerinizi öğrenmek istiyoruz.
          </p>
        </div>

        {/* Survey Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Question 1: Service Satisfaction */}
          <div className="bg-white rounded-lg shadow-lg p-6">
            <label className="block text-lg font-semibold text-gray-900 mb-4">
              1. Telefon Değişim Hizmetinizden memnun kaldınız mı?
            </label>
            <div className="flex gap-2 justify-center">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setServiceRating(star)}
                  className="transition transform hover:scale-110"
                  title={
                    star === 1 ? 'Kötü' :
                    star === 2 ? 'Zayıf' :
                    star === 3 ? 'Orta' :
                    star === 4 ? 'İyi' :
                    'Çok İyi'
                  }
                >
                  <Star
                    size={40}
                    className={`${
                      star <= serviceRating
                        ? 'fill-yellow-400 text-yellow-400'
                        : 'text-gray-300'
                    } transition`}
                  />
                </button>
              ))}
            </div>
            <div className="flex justify-center mt-3 gap-8 text-sm text-gray-600">
              <span>Kötü</span>
              <span>En İyi</span>
            </div>
            {serviceRating > 0 && (
              <p className="text-center mt-3 text-sm font-medium text-blue-600">
                Seçildi: {serviceRating} / 5
              </p>
            )}
          </div>

          {/* Question 2: System Satisfaction */}
          <div className="bg-white rounded-lg shadow-lg p-6">
            <label className="block text-lg font-semibold text-gray-900 mb-4">
              2. Randevu Sisteminden memnun kaldınız mı?
            </label>
            <div className="flex gap-2 justify-center">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setSystemRating(star)}
                  className="transition transform hover:scale-110"
                  title={
                    star === 1 ? 'Kötü' :
                    star === 2 ? 'Zayıf' :
                    star === 3 ? 'Orta' :
                    star === 4 ? 'İyi' :
                    'Çok İyi'
                  }
                >
                  <Star
                    size={40}
                    className={`${
                      star <= systemRating
                        ? 'fill-yellow-400 text-yellow-400'
                        : 'text-gray-300'
                    } transition`}
                  />
                </button>
              ))}
            </div>
            <div className="flex justify-center mt-3 gap-8 text-sm text-gray-600">
              <span>Kötü</span>
              <span>En İyi</span>
            </div>
            {systemRating > 0 && (
              <p className="text-center mt-3 text-sm font-medium text-blue-600">
                Seçildi: {systemRating} / 5
              </p>
            )}
          </div>

          {/* Question 3: Problem Description */}
          <div className="bg-white rounded-lg shadow-lg p-6">
            <label htmlFor="problem" className="block text-lg font-semibold text-gray-900 mb-4">
              3. Bir sorun yaşadınız mı? (İsteğe bağlı)
            </label>
            <textarea
              id="problem"
              value={problemDescription}
              onChange={(e) => setProblemDescription(e.target.value)}
              placeholder="Yaşadığınız sorunları ve önerilerinizi buraya yazabilirsiniz..."
              rows={5}
              className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition resize-none"
            />
            <p className="text-sm text-gray-500 mt-2">
              Karakterler: {problemDescription.length}
            </p>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading || serviceRating === 0 || systemRating === 0}
            className="w-full bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-bold py-3 px-4 rounded-lg transition"
          >
            {loading ? 'Gönderiliyor...' : 'Anketi Gönder'}
          </button>

          {/* Info Message */}
          <p className="text-sm text-gray-600 text-center">
            Anket sonuçlarınız bize hizmetlerimizi geliştirmek için yardımcı olacaktır.
          </p>
        </form>
      </div>
    </div>
  );
}
