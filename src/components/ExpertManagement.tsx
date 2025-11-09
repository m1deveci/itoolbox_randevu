import React, { useState, useEffect } from 'react';
import { Users, Plus, Trash2 } from 'lucide-react';

interface Expert {
  id: string;
  name: string;
  email: string;
}

export function ExpertManagement() {
  const [experts, setExperts] = useState<Expert[]>([]);
  const [newExpert, setNewExpert] = useState({ name: '', email: '' });

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

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4 sm:mb-6">
        <Users className="w-5 sm:w-6 h-5 sm:h-6 flex-shrink-0" />
        <h2 className="text-xl sm:text-2xl font-bold">Uzman Yönetimi</h2>
      </div>

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
                      <button
                        onClick={() => handleDeleteExpert(expert.id)}
                        className="text-red-600 hover:text-red-800 hover:bg-red-50 p-2 rounded transition"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
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
              <div className="flex justify-between items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-sm text-gray-900">{expert.name}</p>
                  <p className="text-xs text-gray-600 truncate font-mono">{expert.email}</p>
                </div>
                <button
                  onClick={() => handleDeleteExpert(expert.id)}
                  className="flex-shrink-0 text-red-600 hover:text-red-800 hover:bg-red-50 p-2 rounded transition"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
