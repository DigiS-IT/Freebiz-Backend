import dotenv from 'dotenv';
dotenv.config();

import dns from 'dns';
dns.setDefaultResultOrder('ipv4first');

import http from 'http';
import https from 'https';
import fs from 'fs';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import routes from './routes';
import { errorHandler, notFoundHandler } from './middlewares/error.middleware';
import { setupExpiredBookingsJob } from './utils/cron-jobs';
import { prisma } from './lib/prisma';
import './services/firebase.service'; // Initialize Firebase

const app = express();

// ============================================
// ENVIRONMENT & SERVER CONFIGURATION
// ============================================
const isProduction = process.env.NODE_ENV === 'production';
const HOST = isProduction ? '0.0.0.0' : (process.env.HOST || '0.0.0.0');
const PORT = Number(process.env.PORT) || (isProduction ? 6000 : 3000);
const API_PREFIX = process.env.API_PREFIX || '/api/v1';

// Certbot SSL certificate paths for production
const SSL_DOMAIN = process.env.SSL_DOMAIN || 'yourdomain.com';
const SSL_KEY_PATH = process.env.SSL_KEY_PATH || `/etc/letsencrypt/live/${SSL_DOMAIN}/privkey.pem`;
const SSL_CERT_PATH = process.env.SSL_CERT_PATH || `/etc/letsencrypt/live/${SSL_DOMAIN}/fullchain.pem`;
const SSL_CA_PATH = process.env.SSL_CA_PATH;
const isSslEnabled = process.env.SSL_ENABLED !== undefined
  ? process.env.SSL_ENABLED === 'true'
  : isProduction;

// ============================================
// MIDDLEWARES
// ============================================

// Security headers
app.use(helmet());

// CORS configuration
const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);

    const configuredOrigins = process.env.CORS_ORIGIN
      ? process.env.CORS_ORIGIN.split(',').map((o) => o.trim())
      : [];

    const isLocalhost = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);

    if (configuredOrigins.includes(origin) || isLocalhost || process.env.NODE_ENV === 'development') {
      return callback(null, true);
    }

    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id', 'Accept', 'Origin'],
};
app.use(cors(corsOptions));

// Handle favicon requests cleanly
app.get('/favicon.ico', (req, res) => res.status(204).end());

// Parse JSON bodies
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Compression
app.use(compression());

// Logging
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// ============================================
// ROUTES
// ============================================

app.use(API_PREFIX, routes);

// Health check endpoints
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
  });
});

app.get('/', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    message: 'FreeBie API Server is running',
    apiPrefix: API_PREFIX,
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
  });
});

// ============================================
// ERROR HANDLING
// ============================================

app.use(notFoundHandler);
app.use(errorHandler);

// ============================================
// SERVER STARTUP
// ============================================

let server: http.Server | https.Server;

async function main() {
  try {
    // Test database connection
    await prisma.$connect();
    console.log('✅ Database connected successfully');

    // Start expired bookings cron job
    setupExpiredBookingsJob();
    console.log('✅ Cron jobs initialized');

    // Start server based on environment & SSL configuration
    if (isSslEnabled) {
      if (!fs.existsSync(SSL_KEY_PATH) || !fs.existsSync(SSL_CERT_PATH)) {
        throw new Error(
          `❌ SSL certificate files not found!\n` +
          `   Key Path:  ${SSL_KEY_PATH}\n` +
          `   Cert Path: ${SSL_CERT_PATH}\n` +
          `   Please verify your Certbot certificate paths in .env (SSL_KEY_PATH, SSL_CERT_PATH, or SSL_DOMAIN).`
        );
      }

      const sslOptions: https.ServerOptions = {
        key: fs.readFileSync(SSL_KEY_PATH),
        cert: fs.readFileSync(SSL_CERT_PATH),
        ...(SSL_CA_PATH && fs.existsSync(SSL_CA_PATH) ? { ca: fs.readFileSync(SSL_CA_PATH) } : {}),
      };

      server = https.createServer(sslOptions, app);
      server.listen(PORT, HOST, () => {
        console.log(`🔒 FreeBie API Server running securely with HTTPS on https://${HOST}:${PORT}`);
        console.log(`📡 API available at https://${SSL_DOMAIN}:${PORT}${API_PREFIX}`);
        console.log(`🔧 Environment: ${process.env.NODE_ENV}`);
      });
    } else {
      server = http.createServer(app);
      server.listen(PORT, HOST, () => {
        console.log(`🚀 FreeBie API Server running with HTTP on http://${HOST}:${PORT}`);
        console.log(`📡 API available at http://localhost:${PORT}${API_PREFIX}`);
        console.log(`🔧 Environment: ${process.env.NODE_ENV || 'development'}`);
      });
    }
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  if (server) {
    server.close();
  }
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received. Shutting down gracefully...');
  if (server) {
    server.close();
  }
  await prisma.$disconnect();
  process.exit(0);
});

if (process.env.NODE_ENV !== 'test') {
  main();
}

export default app;
