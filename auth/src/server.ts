import express, { Express } from 'express';
import { prisma } from '@epsi-pay/database';
import { authRouter } from './routes';

export const authApp: Express = express();

authApp.use(express.json());
authApp.use(express.urlencoded({ extended: true }));

// Montage sur la racine ou /auth
authApp.use('/auth', authRouter);
authApp.use('/', authRouter);

const PORT = process.env.AUTH_PORT
  ? parseInt(process.env.AUTH_PORT, 10)
  : process.env.PORT
  ? parseInt(process.env.PORT, 10)
  : 3001;

if (require.main === module) {
  const server = authApp.listen(PORT, () => {
    console.log(`[AUTH SERVICE] Listening autonomously on port ${PORT} (env: ${process.env.NODE_ENV || 'development'})`);
  });

  const gracefulShutdown = async (signal: string) => {
    console.log(`[AUTH SERVICE] Received ${signal}. Starting graceful shutdown...`);
    server.close(async () => {
      try {
        await prisma.$disconnect();
        console.log('[AUTH SERVICE] Database disconnected cleanly.');
        process.exit(0);
      } catch (err) {
        console.error('[AUTH SERVICE] Disconnect error:', err);
        process.exit(1);
      }
    });

    setTimeout(() => {
      console.error('[AUTH SERVICE] Shutdown timeout. Forcing exit.');
      process.exit(1);
    }, 5000).unref();
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
}
