import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import { PrismaClient } from '@prisma/client';
import routes from './routes';
import { errorHandler, notFoundHandler } from './middlewares/error.middleware';
import { setupExpiredBookingsJob } from './utils/cron-jobs';
import './services/firebase.service'; // Initialize Firebase

export const prisma = new PrismaClient();

const app = express();
const PORT = process.env.PORT || 3000;
const API_PREFIX = process.env.API_PREFIX || '/api/v1';

// ============================================
// MIDDLEWARES
// ============================================

// Security headers
app.use(helmet());

// CORS configuration
const corsOptions: cors.CorsOptions = {
  origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3001'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
};
app.use(cors(corsOptions));

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

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
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

async function main() {
  try {
    // Test database connection
    await prisma.$connect();
    console.log('✅ Database connected successfully');

    // Start expired bookings cron job
    setupExpiredBookingsJob();
    console.log('✅ Cron jobs initialized');

    // Start server
    app.listen(Number(PORT), '0.0.0.0', () => {
      console.log(`🚀 FreeBie API Server running on port ${PORT} (listening on all interfaces)`);
      console.log(`📡 API available at http://localhost:${PORT}${API_PREFIX}`);
      console.log(`🔧 Environment: ${process.env.NODE_ENV}`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received. Shutting down gracefully...');
  await prisma.$disconnect();
  process.exit(0);
});

if (process.env.NODE_ENV !== 'test') {
  main();
}

export default app;
