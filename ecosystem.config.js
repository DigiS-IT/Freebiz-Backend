module.exports = {
  apps: [
    {
      name: 'freebiz-backend',
      script: 'dist/app.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env_production: {
        NODE_ENV: 'production',
      },
    },
  ],
};
