import swaggerJsdoc from 'swagger-jsdoc';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'EPSI Pay API',
      version: '1.0.0',
      description:
        'Documentation de l\'API de la plateforme de paiement résiliente — Projet RESILIENCE-ALPHA.\n\n' +
        'Cette API expose les services de paiement, d\'authentification et de santé du système.',
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
  apis: ['./api/src/routes/*.ts', './api/src/app.ts'],
};

export const swaggerSpec = swaggerJsdoc(options);
