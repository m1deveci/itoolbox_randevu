import React, { useState, useEffect } from 'react';
import { Users, Plus, Trash2, Download, AlertCircle, CheckCircle, Edit2, Lock } from 'lucide-react';
import Swal from 'sweetalert2';

interface Expert {
  id: string;
  name: string;
  email: string;
  role?: string;
}

export function ExpertManagement() {
  const [experts, setExperts] = useState<Expert[]>([]);
  const [newExpert, setNewExpert] = useState({ name: '', email: '' });
  const [importLoading, setImportLoading] = useState(false);
  const [importMessage, setImportMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [editingExpert, setEditingExpert] = useState<Expert | null>(null);

  useEffect(() => {
    loadExperts();
  }, []);

  const loadExperts = async () => {
    try {
      const response = await fetch('/api/experts');
      if (!response.ok) throw new Error('Failed to fetch experts');
      const data = await response.json();
      setExperts(data.map((e: any) => ({ id: e.id.toString(), name: e.name, email: e.email })));
    } catch (error) {
      console.error('Error loading experts:', error);
    }
  };

  const handleAddExpert = async () => {
    try {
      if (!newExpert.name || !newExpert.email) {
        alert('Lütfen ad ve email alanlarını doldurunuz');
        return;
      }

      const response = await fetch('/api/experts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newExpert)
      });

      if (!response.ok) throw new Error('Failed to add expert');
      const data = await response.json();
      setExperts([...experts, { id: data.id.toString(), name: data.name, email: data.email }]);
      setNewExpert({ name: '', email: '' });
    } catch (error) {
      console.error('Error adding expert:', error);
      alert('Uzman eklenirken hata oluştu');
    }
  };

  const handleDeleteExpert = async (id: string) => {
    if (!window.confirm('Bu uzmani silmek istediğinize emin misiniz?')) {
      return;
    }

    try {
      const response = await fetch(`/api/experts/${id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Failed to delete expert');
      setExperts(experts.filter(e => e.id !== id));
    } catch (error) {
      console.error('Error deleting expert:', error);
      alert('Uzman silinirken hata oluştu');
    }
  };

  const handleImportFromIttoolbox = async () => {
    setImportLoading(true);
    setImportMessage(null);

    try {
      const response = await fetch('/api/experts/import/from-ittoolbox', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      const data = await response.json();

      if (!response.ok) {
        setImportMessage({
          type: 'error',
          text: data.error || 'İtoolbox\'tan import sırasında hata oluştu'
        });
        return;
      }

      // Reload experts list
      await loadExperts();

      setImportMessage({
        type: 'success',
        text: `${data.imported} uzman başarıyla importa edildi${data.skipped > 0 ? `, ${data.skipped} atlandı` : ''}`
      });

      // Clear message after 5 seconds
      setTimeout(() => setImportMessage(null), 5000);
    } catch (error) {
      console.error('Error importing experts:', error);
      setImportMessage({
        type: 'error',
        text: 'İtoolbox\'tan import sırasında bir hata oluştu'
      });
    } finally {
      setImportLoading(false);
    }
  };

  const handleEditExpert = async (expert: Expert) => {
    const { value: formValues } = await Swal.fire({
      title: 'Uzman Düzenle',
      html: `
        <input id="swal-name" class="swal2-input" placeholder="Ad" value="${expert.name}">
        <input id="swal-email" class="swal2-input" placeholder="Email" value="${expert.email}">
      `,
      confirmButtonText: 'Kaydet',
      cancelButtonText: 'İptal',
      showCancelButton: true,
      preConfirm: () => {
        const name = (document.getElementById('swal-name') as HTMLInputElement)?.value;
        const email = (document.getElementById('swal-email') as HTMLInputElement)?.value;
        if (!name || !email) {
          Swal.showValidationMessage('Lütfen tüm alanları doldurunuz');
          return false;
        }
        return { name, email };
      }
    });

    if (!formValues) return;

    try {
      const response = await fetch(`/api/experts/${expert.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formValues)
      });

      if (!response.ok) throw new Error('Failed to update expert');

      await loadExperts();
      await Swal.fire('Başarılı', 'Uzman başarıyla güncellendi', 'success');
    } catch (error) {
      console.error('Error updating expert:', error);
      await Swal.fire('Hata', 'Uzman güncellenirken hata oluştu', 'error');
    }
  };

  const handleResetPassword = async (expert: Expert) => {
    const { isConfirmed } = await Swal.fire({
      title: 'Parola Sıfırlama',
      text: `${expert.name} kullanıcısının parolasını sıfırlamak istediğinize emin misiniz?`,
      icon: 'warning',
      confirmButtonText: 'Evet, Sıfırla',
      cancelButtonText: 'İptal',
      showCancelButton: true
    });

    if (!isConfirmed) return;

    try {
      const response = await fetch(`/api/experts/${expert.id}/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      const data = await response.json();

      if (!response.ok) throw new Error(data.error || 'Failed to reset password');

      await Swal.fire({
        title: 'Başarılı',
        html: `<p>Parola başarıyla sıfırlandı</p>
               <div class="bg-blue-50 p-3 rounded mt-3">
                 <p class="text-sm font-mono text-center">${data.newPassword}</p>
               </div>
               <p class="text-xs text-gray-600 mt-2">Geçici parola kullanıcıya gönderildi</p>`,
        icon: 'success'
      });
    } catch (error) {
      console.error('Error resetting password:', error);
      await Swal.fire('Hata', 'Parola sıfırlanırken hata oluştu', 'error');
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4 sm:mb-6">
        <div className="flex items-center gap-2">
          <Users className="w-5 sm:w-6 h-5 sm:h-6 flex-shrink-0" />
          <h2 className="text-xl sm:text-2xl font-bold">Uzman Yönetimi</h2>
        </div>
        <button
          onClick={handleImportFromIttoolbox}
          disabled={importLoading}
          className="flex items-center justify-center gap-2 px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed transition text-sm font-medium"
        >
          <Download className="w-4 h-4" />
          <span className="hidden sm:inline">İTToolbox\'tan İmport Et</span>
          <span className="sm:hidden">İmport</span>
        </button>
      </div>

      {/* Import Message */}
      {importMessage && (
        <div
          className={`flex items-center gap-3 p-4 rounded-lg ${
            importMessage.type === 'success'
              ? 'bg-green-50 border border-green-200'
              : 'bg-red-50 border border-red-200'
          }`}
        >
          {importMessage.type === 'success' ? (
            <CheckCircle className="text-green-600 flex-shrink-0" size={20} />
          ) : (
            <AlertCircle className="text-red-600 flex-shrink-0" size={20} />
          )}
          <p
            className={`text-sm ${
              importMessage.type === 'success' ? 'text-green-700' : 'text-red-700'
            }`}
          >
            {importMessage.text}
          </p>
        </div>
      )}

      {/* Add Expert Form */}
      <div className="bg-white rounded-lg shadow p-4 sm:p-6">
        <h3 className="text-base sm:text-lg font-semibold mb-4">Yeni Uzman Ekle</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <input
            type="text"
            placeholder="Uzman Adı"
            value={newExpert.name}
            onChange={(e) => setNewExpert({ ...newExpert, name: e.target.value })}
            className="border border-gray-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
          />
          <input
            type="email"
            placeholder="Email"
            value={newExpert.email}
            onChange={(e) => setNewExpert({ ...newExpert, email: e.target.value })}
            className="border border-gray-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
          />
          <button
            onClick={handleAddExpert}
            className="col-span-1 sm:col-span-2 lg:col-span-1 bg-blue-500 text-white rounded px-4 py-2 flex items-center justify-center gap-2 hover:bg-blue-600 transition text-sm font-medium"
          >
            <Plus className="w-4 h-4" /> <span className="hidden sm:inline">Ekle</span>
          </button>
        </div>
      </div>

      {/* Experts List - Desktop Table */}
      <div className="hidden md:block bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-100">
              <tr>
                <th className="px-4 lg:px-6 py-3 text-left text-sm font-semibold">Ad</th>
                <th className="px-4 lg:px-6 py-3 text-left text-sm font-semibold">Email</th>
                <th className="px-4 lg:px-6 py-3 text-left text-sm font-semibold">İşlem</th>
              </tr>
            </thead>
            <tbody>
              {experts.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-4 lg:px-6 py-4 text-center text-sm text-gray-500">
                    Henüz uzman tanımlanmamış
                  </td>
                </tr>
              ) : (
                experts.map((expert) => (
                  <tr key={expert.id} className="border-t hover:bg-gray-50">
                    <td className="px-4 lg:px-6 py-3 text-sm">{expert.name}</td>
                    <td className="px-4 lg:px-6 py-3 text-sm font-mono text-gray-600">{expert.email}</td>
                    <td className="px-4 lg:px-6 py-3">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleEditExpert(expert)}
                          className="text-blue-600 hover:text-blue-800 hover:bg-blue-50 p-2 rounded transition"
                          title="Düzenle"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleResetPassword(expert)}
                          className="text-orange-600 hover:text-orange-800 hover:bg-orange-50 p-2 rounded transition"
                          title="Parola Sıfırla"
                        >
                          <Lock className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteExpert(expert.id)}
                          className="text-red-600 hover:text-red-800 hover:bg-red-50 p-2 rounded transition"
                          title="Sil"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Experts List - Mobile Cards */}
      <div className="md:hidden space-y-3">
        {experts.length === 0 ? (
          <div className="text-center py-8 text-sm text-gray-500 bg-white rounded-lg">
            Henüz uzman tanımlanmamış
          </div>
        ) : (
          experts.map((expert) => (
            <div key={expert.id} className="bg-white rounded-lg shadow p-4">
              <div className="flex justify-between items-start gap-3 mb-3">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-sm text-gray-900">{expert.name}</p>
                  <p className="text-xs text-gray-600 truncate font-mono">{expert.email}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleEditExpert(expert)}
                  className="flex-1 flex items-center justify-center gap-2 text-blue-600 hover:text-blue-800 hover:bg-blue-50 p-2 rounded transition text-xs font-medium"
                  title="Düzenle"
                >
                  <Edit2 className="w-3 h-3" />
                  <span>Düzenle</span>
                </button>
                <button
                  onClick={() => handleResetPassword(expert)}
                  className="flex-1 flex items-center justify-center gap-2 text-orange-600 hover:text-orange-800 hover:bg-orange-50 p-2 rounded transition text-xs font-medium"
                  title="Parola Sıfırla"
                >
                  <Lock className="w-3 h-3" />
                  <span>Parola</span>
                </button>
                <button
                  onClick={() => handleDeleteExpert(expert.id)}
                  className="flex-1 flex items-center justify-center gap-2 text-red-600 hover:text-red-800 hover:bg-red-50 p-2 rounded transition text-xs font-medium"
                  title="Sil"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Sil</span>
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
