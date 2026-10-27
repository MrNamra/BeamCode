/* eslint-disable no-undef */
module.exports = {
  apps: [
    {
      name: 'beamcode-signal',
      script: './apps/signal/dist/server.js',
      cwd: __dirname,
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'production',
        PORT: 8080,
        PUBLIC_ORIGIN: process.env.PUBLIC_ORIGIN || 'https://send.myftp.org',
        TRUST_PROXY: 'true',
        STUN_URLS: 'stun:send.myftp.org:3478,stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302,stun:stun.cloudflare.com:3478',
        TURN_URLS: 'turn:send.myftp.org:3478?transport=udp,turn:send.myftp.org:3478?transport=tcp,turns:send.myftp.org:5349?transport=tcp',
        TURN_STATIC_AUTH_SECRET: 'e94f27ca3854b79b8a1c97a59e19d702',
        TURN_CREDENTIAL_TTL_SECONDS: 3600,
      },
    },
  ],
};
