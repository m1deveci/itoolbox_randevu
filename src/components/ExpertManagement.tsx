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
    <div className="space-y-6">
      <div className="flex items-center gap-2 mb-6">
        <Users className="w-6 h-6" />
        <h2 className="text-2xl font-bold">Uzman Yönetimi</h2>
      </div>

      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-4">Yeni Uzman Ekle</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <input
            type="text"
            placeholder="Uzman Adı"
            value={newExpert.name}
            onChange={(e) => setNewExpert({ ...newExpert, name: e.target.value })}
            className="border rounded px-3 py-2"
          />
          <input
            type="email"
            placeholder="Email"
            value={newExpert.email}
            onChange={(e) => setNewExpert({ ...newExpert, email: e.target.value })}
            className="border rounded px-3 py-2"
          />
          <button
            onClick={handleAddExpert}
            className="bg-blue-500 text-white rounded px-4 py-2 flex items-center gap-2 hover:bg-blue-600"
          >
            <Plus className="w-4 h-4" /> Ekle
          </button>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-100">
              <tr>
                <th className="px-6 py-3 text-left font-semibold">Ad</th>
                <th className="px-6 py-3 text-left font-semibold">Email</th>
                <th className="px-6 py-3 text-left font-semibold">İşlem</th>
              </tr>
            </thead>
            <tbody>
              {experts.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-6 py-4 text-center text-gray-500">
                    Henüz uzman tanımlanmamış
                  </td>
                </tr>
              ) : (
                experts.map((expert) => (
                  <tr key={expert.id} className="border-t hover:bg-gray-50">
                    <td className="px-6 py-4">{expert.name}</td>
                    <td className="px-6 py-4">{expert.email}</td>
                    <td className="px-6 py-4">
                      <button
                        onClick={() => handleDeleteExpert(expert.id)}
                        className="text-red-500 hover:text-red-700"
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
    </div>
  );
}
