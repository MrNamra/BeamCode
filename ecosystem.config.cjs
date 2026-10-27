module.exports = {
  apps: [
    {
      name: 'beamcode-signal',
      script: './apps/signal/dist/server.js',
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'production',
        PORT: 8080,
        PUBLIC_ORIGIN: process.env.PUBLIC_ORIGIN || 'http://localhost',
        TRUST_PROXY: 'true',
        STUN_URLS: 'stun:stun.l.google.com:19302',
      },
    },
  ],
};
