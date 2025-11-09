module.exports = {
  apps: [
    {
      name: 'randevu-backend',
      script: './backend/server.cjs',
      cwd: '/var/www/randevu.devkit.com.tr',
      instances: 'max',
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
        PORT: 4040
      },
      error_file: '/var/log/pm2/randevu-backend-error.log',
      out_file: '/var/log/pm2/randevu-backend-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      node_args: '--max-old-space-size=512'
    }
  ]
};
