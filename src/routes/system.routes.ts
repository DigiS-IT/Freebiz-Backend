import { Router, Request, Response } from 'express';

const router: Router = Router();

/**
 * Handshake endpoint called when a client (mobile app, web, admin) connects.
 * Logs prominent confirmation in backend terminal and returns server status.
 */
router.post('/client-connect', (req: Request, res: Response) => {
  const clientIp =
    (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
    req.socket.remoteAddress ||
    req.ip ||
    'Unknown IP';

  const {
    clientType = 'mobile',
    platform = 'Android',
    device = 'Physical Device',
    appVersion = '1.0.0',
    clientTime,
  } = req.body || {};

  const serverTime = new Date().toISOString();

  // Print high-visibility banner in the backend console
  console.log('\n' + '='.repeat(70));
  console.log('📱 \x1b[32m\x1b[1m[CLIENT CONNECTED TO BACKEND]\x1b[0m');
  console.log(`   📍 \x1b[36mClient IP   \x1b[0m : ${clientIp}`);
  console.log(`   📱 \x1b[36mDevice / OS \x1b[0m : ${platform} (${device})`);
  console.log(`   🏷️  \x1b[36mClient Type \x1b[0m : ${clientType} (v${appVersion})`);
  console.log(`   ⏰ \x1b[36mConnected At\x1b[0m : ${serverTime}`);
  if (clientTime) {
    console.log(`   ⏱️  \x1b[36mClient Clock\x1b[0m : ${clientTime}`);
  }
  console.log('   ✅ \x1b[32mStatus       : Handshake Verified - Backend ready on port 9001\x1b[0m');
  console.log('='.repeat(70) + '\n');

  res.status(200).json({
    success: true,
    message: 'FreeBie Backend successfully connected',
    serverTime,
    clientIp,
    host: req.headers.host,
    port: 9001,
  });
});

/**
 * Lightweight ping endpoint
 */
router.get('/ping', (req: Request, res: Response) => {
  res.status(200).json({
    status: 'pong',
    server: 'FreeBie Backend API',
    port: 9001,
    timestamp: new Date().toISOString(),
  });
});

export default router;
