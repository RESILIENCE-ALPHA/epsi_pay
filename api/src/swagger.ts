import swaggerJsdoc from 'swagger-jsdoc';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'EPSI Pay API',
      version: '1.0.0',
      description:
        'Documentation de l\'API de la plateforme de paiement résiliente — Projet RESILIENCE-ALPHA.\n\n' +
        'Cette API expose les services d\'authentification, de paiement et de santé du système.',
      contact: {
        name: 'Équipe EPSI Pay',
      },
    },
    servers: [
      {
        url: 'http://localhost:3000',
        description: 'Serveur de développement local',
      },
      {
        url: 'http://epsi-pay-api:3000',
        description: 'Serveur Docker Compose / Kubernetes',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'Token',
          description: 'Entrez le jeton de session obtenu lors de l\'appel à /auth/login',
        },
      },
      schemas: {
        ServiceInfo: {
          type: 'object',
          properties: {
            service: { type: 'string', example: 'epsi-pay-api' },
            status: { type: 'string', example: 'operational' },
            version: { type: 'string', example: '1.0.0' },
            description: { type: 'string', example: 'Plateforme de paiement résiliente - Project RESILIENCE-ALPHA' },
            timestamp: { type: 'string', format: 'date-time' },
          },
        },
        HealthStatus: {
          type: 'object',
          properties: {
            status: {
              type: 'string',
              enum: ['healthy', 'degraded'],
              example: 'healthy',
            },
            uptime: { type: 'number', example: 42.15 },
            timestamp: { type: 'string', format: 'date-time' },
            checks: {
              type: 'object',
              properties: {
                database: {
                  type: 'string',
                  enum: ['up', 'down'],
                  example: 'up',
                },
                error: {
                  type: 'string',
                  description: 'Message d\'erreur si la base de données est indisponible',
                  example: 'Connection refused to postgres:5432',
                },
              },
            },
          },
        },
        UserProfile: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid', example: 'd4b7c62e-8a1f-4c8d-9b3e-1f2a3b4c5d6e' },
            email: { type: 'string', format: 'email', example: 'alice@epsi.fr' },
            name: { type: 'string', example: 'Alice Martin' },
            role: { type: 'string', enum: ['CLIENT', 'MERCHANT', 'ADMIN'], example: 'CLIENT' },
            status: { type: 'string', enum: ['ACTIVE', 'LOCKED', 'SUSPENDED'], example: 'ACTIVE' },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        ErrorNotFound: {
          type: 'object',
          properties: {
            error: { type: 'string', example: 'Not Found' },
            message: { type: 'string', example: 'Route GET /route-inconnue not found' },
            timestamp: { type: 'string', format: 'date-time' },
          },
        },
      },
    },
  },
  // Scan des fichiers sources pour les annotations JSDoc
  apis: [
    './api/src/**/*.ts',
    './auth/src/**/*.ts',
    '../auth/src/**/*.ts',
    './src/**/*.ts',
    './dist/src/**/*.js',
  ],
};

export const swaggerSpec = swaggerJsdoc(options);
