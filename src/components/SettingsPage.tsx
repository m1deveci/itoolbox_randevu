import React, { useState, useEffect } from 'react';
import { Save, Mail, Globe, FileText, Activity } from 'lucide-react';
import Swal from 'sweetalert2';

interface Settings {
  [key: string]: {
    value: string;
    description: string;
  };
}

interface ActivityLog {
  id: number;
  user_id: number | null;
  user_name: string;
  action: string;
  entity_type: string | null;
  entity_id: number | null;
  details: string;
  ip_address: string;
  user_agent: string;
  created_at: string;
}

interface AdminUser {
  id: number;
  name: string;
  email: string;
  role: string;
}

interface Props {
  adminUser: AdminUser | null;
}

export function SettingsPage({ adminUser }: Props) {
  const [settings, setSettings] = useState<Settings>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [activeTab, setActiveTab] = useState<'general' | 'smtp' | 'logs'>('general');
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsPage, setLogsPage] = useState(1);
  const [logsTotal, setLogsTotal] = useState(0);
  const [smtpSettings, setSmtpSettings] = useState({
    smtp_enabled: 'false',
    smtp_host: '',
    smtp_port: '587',
    smtp_user: '',
    smtp_password: '',
    smtp_from_email: '',
    smtp_from_name: 'IT Randevu Sistemi'
  });

  useEffect(() => {
    loadSettings();
  }, []);

  useEffect(() => {
    if (activeTab === 'logs') {
      loadActivityLogs();
    }
  }, [activeTab, logsPage]);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/settings');
      if (!response.ok) throw new Error('Failed to fetch settings');
      const data = await response.json();
      setSettings(data);
      
      // Load SMTP settings into state
      setSmtpSettings({
        smtp_enabled: data.smtp_enabled?.value || 'false',
        smtp_host: data.smtp_host?.value || '',
        smtp_port: data.smtp_port?.value || '587',
        smtp_user: data.smtp_user?.value || '',
        smtp_password: data.smtp_password?.value || '',
        smtp_from_email: data.smtp_from_email?.value || '',
        smtp_from_name: data.smtp_from_name?.value || 'IT Randevu Sistemi'
      });
    } catch (error) {
      console.error('Error loading settings:', error);
      await Swal.fire({
        icon: 'error',
        title: 'Hata',
        text: 'Ayarlar yüklenirken hata oluştu',
        confirmButtonColor: '#ef4444'
      });
    } finally {
      setLoading(false);
    }
  };

  const loadActivityLogs = async () => {
    setLogsLoading(true);
    try {
      const response = await fetch(`/api/settings/activity-logs/list?page=${logsPage}&limit=20`);
      if (!response.ok) throw new Error('Failed to fetch activity logs');
      const data = await response.json();
      setActivityLogs(data.logs.map((log: any) => ({
        ...log,
        details: log.details ? JSON.parse(log.details) : null
      })));
      setLogsTotal(data.pagination.total);
    } catch (error) {
      console.error('Error loading activity logs:', error);
    } finally {
      setLogsLoading(false);
    }
  };

  const updateSetting = async (key: string, value: string) => {
    setSaving(true);
    try {
      const response = await fetch(`/api/settings/${key}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': adminUser?.id?.toString() || '',
          'x-user-name': adminUser?.name || ''
        },
        body: JSON.stringify({ value })
      });

      if (!response.ok) throw new Error('Failed to update setting');

      setSettings(prev => ({
        ...prev,
        [key]: { ...prev[key], value }
      }));

      await Swal.fire({
        icon: 'success',
        title: 'Başarılı',
        text: 'Ayar güncellendi',
        confirmButtonColor: '#3b82f6',
        timer: 1500
      });
    } catch (error) {
      console.error('Error updating setting:', error);
      await Swal.fire({
        icon: 'error',
        title: 'Hata',
        text: 'Ayar güncellenirken hata oluştu',
        confirmButtonColor: '#ef4444'
      });
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async (key: string) => {
    const value = settings[key]?.value || '';
    await updateSetting(key, value);
  };

  const handleSaveAllSmtp = async () => {
    setSaving(true);
    try {
      // Save all SMTP settings
      const promises = Object.entries(smtpSettings).map(([key, value]) =>
        updateSetting(key, value)
      );
      
      await Promise.all(promises);
      
      await Swal.fire({
        icon: 'success',
        title: 'Başarılı',
        text: 'Tüm SMTP ayarları kaydedildi',
        confirmButtonColor: '#3b82f6',
        timer: 1500
      });
    } catch (error) {
      console.error('Error saving SMTP settings:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleTestSmtp = async () => {
    if (!smtpSettings.smtp_enabled || smtpSettings.smtp_enabled === 'false') {
      await Swal.fire({
        icon: 'warning',
        title: 'SMTP Pasif',
        text: 'SMTP ayarlarını test etmek için önce SMTP\'yi aktifleştirin',
        confirmButtonColor: '#3b82f6'
      });
      return;
    }

    if (!smtpSettings.smtp_host || !smtpSettings.smtp_user || !smtpSettings.smtp_from_email) {
      await Swal.fire({
        icon: 'warning',
        title: 'Eksik Bilgi',
        text: 'SMTP Host, Kullanıcı Adı ve Gönderen E-posta alanları doldurulmalıdır',
        confirmButtonColor: '#3b82f6'
      });
      return;
    }

    setTesting(true);
    try {
      const response = await fetch('/api/settings/test-smtp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': adminUser?.id?.toString() || '',
          'x-user-name': adminUser?.name || ''
        },
        body: JSON.stringify(smtpSettings)
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'SMTP test başarısız');
      }

      await Swal.fire({
        icon: 'success',
        title: 'SMTP Test Başarılı',
        text: data.message || 'SMTP bağlantısı başarıyla test edildi',
        confirmButtonColor: '#3b82f6'
      });
    } catch (error) {
      console.error('Error testing SMTP:', error);
      await Swal.fire({
        icon: 'error',
        title: 'SMTP Test Başarısız',
        text: error instanceof Error ? error.message : 'SMTP bağlantısı test edilemedi',
        confirmButtonColor: '#ef4444'
      });
    } finally {
      setTesting(false);
    }
  };

  const getActionText = (action: string) => {
    const actionMap: { [key: string]: string } = {
      'create': 'Oluşturma',
      'update': 'Güncelleme',
      'delete': 'Silme',
      'update_setting': 'Ayar Güncelleme',
      'login': 'Giriş',
      'logout': 'Çıkış',
      'approve_appointment': 'Randevu Onaylama',
      'cancel_appointment': 'Randevu İptal',
      'add_availability': 'Müsaitlik Ekleme',
      'remove_availability': 'Müsaitlik Kaldırma'
    };
    return actionMap[action] || action;
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <h2 className="text-xl sm:text-2xl font-bold">Sistem Ayarları</h2>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-200">
        <button
          onClick={() => setActiveTab('general')}
          className={`px-4 py-2 border-b-2 font-medium text-sm transition ${
            activeTab === 'general'
              ? 'border-blue-500 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Globe size={16} className="inline mr-2" />
          Genel Ayarlar
        </button>
        <button
          onClick={() => setActiveTab('smtp')}
          className={`px-4 py-2 border-b-2 font-medium text-sm transition ${
            activeTab === 'smtp'
              ? 'border-blue-500 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Mail size={16} className="inline mr-2" />
          SMTP Ayarları
        </button>
        <button
          onClick={() => setActiveTab('logs')}
          className={`px-4 py-2 border-b-2 font-medium text-sm transition ${
            activeTab === 'logs'
              ? 'border-blue-500 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Activity size={16} className="inline mr-2" />
          İşlem Logları
        </button>
      </div>

      {loading && (
        <div className="text-center py-8 text-gray-500">Yükleniyor...</div>
      )}

      {/* General Settings */}
      {!loading && activeTab === 'general' && (
        <div className="bg-white rounded-lg shadow p-6 space-y-6">
          {/* Site Title */}
          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-2">
              Site Başlığı
            </label>
            <input
              type="text"
              value={settings.site_title?.value || ''}
              onChange={(e) => setSettings(prev => ({
                ...prev,
                site_title: { ...prev.site_title, value: e.target.value }
              }))}
              className="w-full border-2 border-gray-300 rounded-lg px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition"
            />
            <p className="mt-1 text-xs text-gray-500">{settings.site_title?.description}</p>
            <button
              onClick={() => handleSave('site_title')}
              disabled={saving}
              className="mt-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-medium"
            >
              <Save size={16} className="inline mr-2" />
              Kaydet
            </button>
          </div>

          {/* Site Logo */}
          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-2">
              Site Logosu (URL)
            </label>
            <input
              type="text"
              value={settings.site_logo?.value || ''}
              onChange={(e) => setSettings(prev => ({
                ...prev,
                site_logo: { ...prev.site_logo, value: e.target.value }
              }))}
              placeholder="https://example.com/logo.png"
              className="w-full border-2 border-gray-300 rounded-lg px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition"
            />
            <p className="mt-1 text-xs text-gray-500">{settings.site_logo?.description}</p>
            {settings.site_logo?.value && (
              <div className="mt-2">
                <img src={settings.site_logo.value} alt="Logo" className="max-h-20" onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }} />
              </div>
            )}
            <button
              onClick={() => handleSave('site_logo')}
              disabled={saving}
              className="mt-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-medium"
            >
              <Save size={16} className="inline mr-2" />
              Kaydet
            </button>
          </div>
        </div>
      )}

      {/* SMTP Settings */}
      {!loading && activeTab === 'smtp' && (
        <div className="bg-white rounded-lg shadow p-6 space-y-6">
          {/* SMTP Enabled */}
          <div>
            <label className="flex items-center gap-2 mb-2">
              <input
                type="checkbox"
                checked={smtpSettings.smtp_enabled === 'true'}
                onChange={(e) => {
                  setSmtpSettings(prev => ({
                    ...prev,
                    smtp_enabled: e.target.checked ? 'true' : 'false'
                  }));
                }}
                className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
              />
              <span className="text-sm font-semibold text-gray-900">SMTP Aktif</span>
            </label>
            <p className="text-xs text-gray-500 ml-6">E-posta gönderimlerini aktifleştir</p>
          </div>

          {/* SMTP Host */}
          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-2">
              SMTP Sunucu <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={smtpSettings.smtp_host}
              onChange={(e) => setSmtpSettings(prev => ({
                ...prev,
                smtp_host: e.target.value
              }))}
              placeholder="smtp.example.com"
              className="w-full border-2 border-gray-300 rounded-lg px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition"
            />
          </div>

          {/* SMTP Port */}
          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-2">
              SMTP Port <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              value={smtpSettings.smtp_port}
              onChange={(e) => setSmtpSettings(prev => ({
                ...prev,
                smtp_port: e.target.value
              }))}
              placeholder="587"
              className="w-full border-2 border-gray-300 rounded-lg px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition"
            />
          </div>

          {/* SMTP User */}
          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-2">
              SMTP Kullanıcı Adı <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={smtpSettings.smtp_user}
              onChange={(e) => setSmtpSettings(prev => ({
                ...prev,
                smtp_user: e.target.value
              }))}
              placeholder="user@example.com"
              className="w-full border-2 border-gray-300 rounded-lg px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition"
            />
          </div>

          {/* SMTP Password */}
          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-2">
              SMTP Şifre <span className="text-red-500">*</span>
            </label>
            <input
              type="password"
              value={smtpSettings.smtp_password}
              onChange={(e) => setSmtpSettings(prev => ({
                ...prev,
                smtp_password: e.target.value
              }))}
              placeholder="••••••••"
              className="w-full border-2 border-gray-300 rounded-lg px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition"
            />
          </div>

          {/* SMTP From Email */}
          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-2">
              Gönderen E-posta <span className="text-red-500">*</span>
            </label>
            <input
              type="email"
              value={smtpSettings.smtp_from_email}
              onChange={(e) => setSmtpSettings(prev => ({
                ...prev,
                smtp_from_email: e.target.value
              }))}
              placeholder="noreply@example.com"
              className="w-full border-2 border-gray-300 rounded-lg px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition"
            />
          </div>

          {/* SMTP From Name */}
          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-2">
              Gönderen Adı
            </label>
            <input
              type="text"
              value={smtpSettings.smtp_from_name}
              onChange={(e) => setSmtpSettings(prev => ({
                ...prev,
                smtp_from_name: e.target.value
              }))}
              placeholder="IT Randevu Sistemi"
              className="w-full border-2 border-gray-300 rounded-lg px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition"
            />
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 pt-4 border-t">
            <button
              onClick={handleSaveAllSmtp}
              disabled={saving}
              className="flex-1 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-medium flex items-center justify-center gap-2"
            >
              <Save size={18} />
              Tüm SMTP Ayarlarını Kaydet
            </button>
            <button
              onClick={handleTestSmtp}
              disabled={testing || saving}
              className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 text-sm font-medium flex items-center justify-center gap-2"
            >
              {testing ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  Test Ediliyor...
                </>
              ) : (
                <>
                  <Mail size={18} />
                  SMTP Test Et
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Activity Logs */}
      {!loading && activeTab === 'logs' && (
        <div className="bg-white rounded-lg shadow">
          <div className="p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">İşlem Logları</h3>
            
            {logsLoading ? (
              <div className="text-center py-8 text-gray-500">Yükleniyor...</div>
            ) : activityLogs.length === 0 ? (
              <div className="text-center py-8 text-gray-500">Log kaydı bulunamadı</div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-100">
                      <tr>
                        <th className="px-4 py-3 text-left text-sm font-semibold">Tarih/Saat</th>
                        <th className="px-4 py-3 text-left text-sm font-semibold">Kullanıcı</th>
                        <th className="px-4 py-3 text-left text-sm font-semibold">İşlem</th>
                        <th className="px-4 py-3 text-left text-sm font-semibold">Detay</th>
                        <th className="px-4 py-3 text-left text-sm font-semibold">IP Adresi</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activityLogs.map((log) => (
                        <tr key={log.id} className="border-t hover:bg-gray-50">
                          <td className="px-4 py-3 text-sm">
                            {new Date(log.created_at).toLocaleString('tr-TR')}
                          </td>
                          <td className="px-4 py-3 text-sm">{log.user_name || 'Sistem'}</td>
                          <td className="px-4 py-3 text-sm">
                            <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs">
                              {getActionText(log.action)}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600">
                            {log.details ? (
                              <details className="cursor-pointer">
                                <summary className="text-blue-600 hover:text-blue-800">Detayları Gör</summary>
                                <pre className="mt-2 text-xs bg-gray-50 p-2 rounded overflow-auto">
                                  {JSON.stringify(log.details, null, 2)}
                                </pre>
                              </details>
                            ) : '-'}
                          </td>
                          <td className="px-4 py-3 text-sm font-mono text-xs">{log.ip_address}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                
                {/* Pagination */}
                {logsTotal > 20 && (
                  <div className="mt-4 flex items-center justify-between">
                    <p className="text-sm text-gray-600">
                      Toplam {logsTotal} kayıt
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setLogsPage(prev => Math.max(1, prev - 1))}
                        disabled={logsPage === 1}
                        className="px-3 py-1 border border-gray-300 rounded text-sm disabled:opacity-50"
                      >
                        Önceki
                      </button>
                      <span className="px-3 py-1 text-sm">
                        Sayfa {logsPage} / {Math.ceil(logsTotal / 20)}
                      </span>
                      <button
                        onClick={() => setLogsPage(prev => prev + 1)}
                        disabled={logsPage >= Math.ceil(logsTotal / 20)}
                        className="px-3 py-1 border border-gray-300 rounded text-sm disabled:opacity-50"
                      >
                        Sonraki
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

