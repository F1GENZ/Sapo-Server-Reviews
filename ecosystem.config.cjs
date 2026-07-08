// PM2 ecosystem config for F1GENZ Review Sapo
// Deploy: pm2 start ecosystem.config.cjs
// Reload: pm2 reload ecosystem.config.cjs --update-env

module.exports = {
  apps: [
    {
      name: 'f1genz-sapo-api',
      script: 'dist/main.js',
      cwd: '.',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PROCESS_ROLE: 'api',
      },
      time: true,
      max_memory_restart: '512M',
    },
    {
      name: 'f1genz-sapo-worker',
      script: 'dist/main.js',
      cwd: '.',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PROCESS_ROLE: 'worker',
      },
      time: true,
      max_memory_restart: '512M',
    },
  ],
};
