'use strict';

const express = require('express');
const { version } = require('../../package.json');

const router = express.Router();

function buildSpec() {
  return {
    openapi: '3.0.3',
    info: {
      title: 'ShadowRadar API',
      description: [
        'API for the External Security Posture Management (ESPM) platform.',
        '',
        '## Authentication',
        '',
        'Most endpoints require a **JWT session cookie** (`token`) set by `POST /api/auth/login`.',
        '',
        'External integration endpoints (`/api/v1/export`, `/api/v1/assets/sync`) also accept an **X-API-Key** header.',
        '',
        '## Roles',
        '',
        '- `reader` — read-only access to GET endpoints.',
        '- `editor` — full access including create, update, delete, scan, and config.',
      ].join('\n'),
      version,
    },
    servers: [{ url: '/', description: 'This server' }],
    security: [{ cookieAuth: [] }],
    components: {
      securitySchemes: {
        cookieAuth: {
          type: 'apiKey',
          in: 'cookie',
          name: 'token',
          description: 'JWT token obtained from `POST /api/auth/login`.',
        },
        apiKeyHeader: {
          type: 'apiKey',
          in: 'header',
          name: 'X-API-Key',
          description: 'API key created via `POST /api/settings/api-keys`.',
        },
      },
      schemas: {
        Error: {
          type: 'object',
          properties: { error: { type: 'string' } },
          required: ['error'],
        },
        User: {
          type: 'object',
          properties: {
            id: { type: 'integer', example: 1 },
            username: { type: 'string', example: 'admin' },
            role: { type: 'string', enum: ['reader', 'editor'] },
          },
        },
        Asset: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            name: { type: 'string', example: 'nginx' },
            tag: { type: 'string', nullable: true, example: 'production' },
            url: { type: 'string', nullable: true, example: 'https://nginx.org' },
            current_version: { type: 'string', example: '1.25.3' },
            description: { type: 'string', nullable: true },
            active: { type: 'integer', enum: [0, 1] },
            cve_start_date: { type: 'string', format: 'date', nullable: true },
            created_at: { type: 'string', format: 'date-time' },
            updated_at: { type: 'string', format: 'date-time' },
          },
        },
        AssetInput: {
          type: 'object',
          required: ['name', 'current_version'],
          properties: {
            name: { type: 'string', example: 'nginx' },
            tag: { type: 'string', example: 'production' },
            url: { type: 'string', example: 'https://nginx.org' },
            current_version: { type: 'string', example: '1.25.3' },
            description: { type: 'string' },
            active: { type: 'boolean', default: true },
            cve_start_date: { type: 'string', format: 'date', example: '2024-01-01' },
          },
        },
        Cve: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            cve_id: { type: 'string', example: 'CVE-2024-12345' },
            asset_id: { type: 'integer' },
            description: { type: 'string', nullable: true },
            severity: { type: 'string', enum: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'NONE'] },
            cvss_score: { type: 'number', nullable: true, example: 9.8 },
            published_at: { type: 'string', format: 'date', nullable: true },
            scanned_at: { type: 'string', format: 'date-time', nullable: true },
            user_assessment: { type: 'string', nullable: true },
            ai_assessment: { type: 'string', nullable: true },
          },
        },
        ScanStatus: {
          type: 'object',
          properties: {
            running: { type: 'boolean' },
            scan_id: { type: 'integer', nullable: true },
            status: { type: 'string', enum: ['running', 'completed', 'failed'], nullable: true },
            started_at: { type: 'string', format: 'date-time', nullable: true },
            assets_count: { type: 'integer', nullable: true },
            scanned_count: { type: 'integer', nullable: true },
          },
        },
        ScanRun: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            status: { type: 'string', enum: ['running', 'completed', 'failed'] },
            started_at: { type: 'string', format: 'date-time' },
            finished_at: { type: 'string', format: 'date-time', nullable: true },
            duration_seconds: { type: 'integer', nullable: true },
          },
        },
        ApiKey: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            name: { type: 'string', example: 'My Integration' },
            masked_key: { type: 'string', example: 'sk-****abcd' },
            created_at: { type: 'string', format: 'date-time' },
            last_used_at: { type: 'string', format: 'date-time', nullable: true },
          },
        },
        ExportReport: {
          type: 'object',
          properties: {
            last_scan: { type: 'string', format: 'date-time', nullable: true },
            report_items: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string', example: 'nginx_1.25.3' },
                  name: { type: 'string' },
                  url: { type: 'string' },
                  current_version: { type: 'string' },
                  pubEndDate_checked: { type: 'string', format: 'date', nullable: true },
                  risk: { type: 'string', enum: ['Critical', 'High', 'Medium', 'Low', 'None'] },
                  alert: { type: 'string', example: 'Immediate action required' },
                  cves: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        cve_id: { type: 'string' },
                        description: { type: 'string' },
                        severity: { type: 'string', enum: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'NONE'] },
                        published_date: { type: 'string', format: 'date', nullable: true },
                        assessment: { type: 'string' },
                        claude_ai_assessment: { type: 'string' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      responses: {
        Unauthorized: {
          description: 'Authentication required.',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
        },
        Forbidden: {
          description: 'Insufficient permissions (`editor` role required).',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
        },
        NotFound: {
          description: 'Resource not found.',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
        },
        Conflict: {
          description: 'Conflict with existing resource.',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
        },
        BadRequest: {
          description: 'Validation error.',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
        },
      },
    },
    tags: [
      { name: 'Auth',      description: 'Authentication and session management' },
      { name: 'Assets',    description: 'Asset CRUD and lifecycle' },
      { name: 'CVEs',      description: 'Vulnerability results and assessments' },
      { name: 'Scan',      description: 'Scan execution and history' },
      { name: 'Config',    description: 'NIST and AI configuration (editor only)' },
      { name: 'API Keys',  description: 'API key management for external integrations (editor only)' },
      { name: 'Dashboard', description: 'Summary and KPI data' },
      { name: 'Export',    description: 'Security report export (JWT cookie or X-API-Key)' },
      { name: 'Sync',      description: 'Bulk asset sync from external systems (X-API-Key only)' },
    ],
    paths: {
      '/api/health': {
        get: {
          tags: ['Auth'],
          summary: 'Health check',
          security: [],
          responses: {
            200: {
              description: 'Service is healthy.',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      status:  { type: 'string', example: 'ok' },
                      version: { type: 'string', example: '1.0.0' },
                    },
                  },
                },
              },
            },
          },
        },
      },

      '/api/auth/login': {
        post: {
          tags: ['Auth'],
          summary: 'Login',
          description: 'Authenticates user credentials and sets a JWT `token` httpOnly cookie. Rate-limited to 10 requests per 15 minutes per IP.',
          security: [],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['username', 'password'],
                  properties: {
                    username: { type: 'string', example: 'admin' },
                    password: { type: 'string', example: 'admin123' },
                  },
                },
              },
            },
          },
          responses: {
            200: {
              description: 'Login successful. JWT cookie is set.',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: { user: { $ref: '#/components/schemas/User' } },
                  },
                },
              },
            },
            400: { $ref: '#/components/responses/BadRequest' },
            401: { $ref: '#/components/responses/Unauthorized' },
            429: { description: 'Too many login attempts.' },
          },
        },
      },

      '/api/auth/logout': {
        post: {
          tags: ['Auth'],
          summary: 'Logout',
          description: 'Clears the JWT cookie. Idempotent.',
          security: [],
          responses: {
            200: {
              description: 'Logout successful.',
              content: {
                'application/json': {
                  schema: { type: 'object', properties: { ok: { type: 'boolean' } } },
                },
              },
            },
          },
        },
      },

      '/api/auth/me': {
        get: {
          tags: ['Auth'],
          summary: 'Get current user',
          description: 'Returns the user decoded from the JWT cookie.',
          responses: {
            200: {
              description: 'Current authenticated user.',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: { user: { $ref: '#/components/schemas/User' } },
                  },
                },
              },
            },
            401: { $ref: '#/components/responses/Unauthorized' },
          },
        },
      },

      '/api/assets': {
        get: {
          tags: ['Assets'],
          summary: 'List assets',
          parameters: [
            { name: 'active',  in: 'query', schema: { type: 'boolean' }, description: 'Filter by active status.' },
            { name: 'search',  in: 'query', schema: { type: 'string'  }, description: 'Search by name or tag.' },
          ],
          responses: {
            200: {
              description: 'List of assets.',
              content: {
                'application/json': {
                  schema: { type: 'array', items: { $ref: '#/components/schemas/Asset' } },
                },
              },
            },
            401: { $ref: '#/components/responses/Unauthorized' },
          },
        },
        post: {
          tags: ['Assets'],
          summary: 'Create asset',
          description: 'Requires `editor` role.',
          requestBody: {
            required: true,
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/AssetInput' } },
            },
          },
          responses: {
            201: {
              description: 'Asset created.',
              content: {
                'application/json': { schema: { $ref: '#/components/schemas/Asset' } },
              },
            },
            400: { $ref: '#/components/responses/BadRequest' },
            401: { $ref: '#/components/responses/Unauthorized' },
            403: { $ref: '#/components/responses/Forbidden' },
            409: { $ref: '#/components/responses/Conflict' },
          },
        },
      },

      '/api/assets/{id}': {
        get: {
          tags: ['Assets'],
          summary: 'Get asset by ID',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' }, example: 1 }],
          responses: {
            200: {
              description: 'Asset details.',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/Asset' } } },
            },
            401: { $ref: '#/components/responses/Unauthorized' },
            404: { $ref: '#/components/responses/NotFound' },
          },
        },
        put: {
          tags: ['Assets'],
          summary: 'Update asset',
          description: 'Requires `editor` role.',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' }, example: 1 }],
          requestBody: {
            required: true,
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/AssetInput' } },
            },
          },
          responses: {
            200: {
              description: 'Updated asset.',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/Asset' } } },
            },
            400: { $ref: '#/components/responses/BadRequest' },
            401: { $ref: '#/components/responses/Unauthorized' },
            403: { $ref: '#/components/responses/Forbidden' },
            404: { $ref: '#/components/responses/NotFound' },
            409: { $ref: '#/components/responses/Conflict' },
          },
        },
        delete: {
          tags: ['Assets'],
          summary: 'Delete asset',
          description: 'Requires `editor` role. Cascades to all associated CVEs.',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' }, example: 1 }],
          responses: {
            204: { description: 'Asset deleted.' },
            401: { $ref: '#/components/responses/Unauthorized' },
            403: { $ref: '#/components/responses/Forbidden' },
            404: { $ref: '#/components/responses/NotFound' },
          },
        },
      },

      '/api/assets/{id}/toggle': {
        patch: {
          tags: ['Assets'],
          summary: 'Toggle asset active status',
          description: 'Requires `editor` role.',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' }, example: 1 }],
          responses: {
            200: {
              description: 'Asset with updated `active` field.',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/Asset' } } },
            },
            401: { $ref: '#/components/responses/Unauthorized' },
            403: { $ref: '#/components/responses/Forbidden' },
            404: { $ref: '#/components/responses/NotFound' },
          },
        },
      },

      '/api/cves': {
        get: {
          tags: ['CVEs'],
          summary: 'List CVEs',
          parameters: [
            { name: 'asset_id',   in: 'query', schema: { type: 'integer' },                                       description: 'Filter by asset ID.' },
            { name: 'severity',   in: 'query', schema: { type: 'string'  }, example: 'CRITICAL,HIGH',             description: 'Comma-separated severity list.' },
            { name: 'assessment', in: 'query', schema: { type: 'string'  },                                       description: 'Filter by user assessment value.' },
            { name: 'page',       in: 'query', schema: { type: 'integer', default: 1  },                          description: 'Page number.' },
            { name: 'page_size',  in: 'query', schema: { type: 'integer', default: 25 },                          description: 'Results per page.' },
          ],
          responses: {
            200: {
              description: 'List of CVEs.',
              content: {
                'application/json': {
                  schema: { type: 'array', items: { $ref: '#/components/schemas/Cve' } },
                },
              },
            },
            401: { $ref: '#/components/responses/Unauthorized' },
          },
        },
      },

      '/api/cves/macro': {
        get: {
          tags: ['CVEs'],
          summary: 'CVE macro view',
          description: 'Aggregated CVE counts grouped by severity.',
          parameters: [
            { name: 'asset_id', in: 'query', schema: { type: 'integer' }, description: 'Filter by asset ID.' },
          ],
          responses: {
            200: {
              description: 'Macro summary.',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      summary_by_severity: {
                        type: 'object',
                        additionalProperties: { type: 'integer' },
                        example: { CRITICAL: 2, HIGH: 5, MEDIUM: 12, LOW: 3 },
                      },
                    },
                  },
                },
              },
            },
            401: { $ref: '#/components/responses/Unauthorized' },
          },
        },
      },

      '/api/cves/{id}': {
        get: {
          tags: ['CVEs'],
          summary: 'Get CVE by ID',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' }, example: 1 }],
          responses: {
            200: {
              description: 'CVE details.',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/Cve' } } },
            },
            401: { $ref: '#/components/responses/Unauthorized' },
            404: { $ref: '#/components/responses/NotFound' },
          },
        },
      },

      '/api/cves/{id}/assessment': {
        put: {
          tags: ['CVEs'],
          summary: 'Update CVE assessment',
          description: 'Requires `editor` role.',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' }, example: 1 }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    user_assessment: { type: 'string', nullable: true, example: 'Not Affected' },
                    ai_assessment:   { type: 'string', nullable: true },
                  },
                },
              },
            },
          },
          responses: {
            200: {
              description: 'Updated CVE.',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/Cve' } } },
            },
            400: { $ref: '#/components/responses/BadRequest' },
            401: { $ref: '#/components/responses/Unauthorized' },
            403: { $ref: '#/components/responses/Forbidden' },
            404: { $ref: '#/components/responses/NotFound' },
          },
        },
      },

      '/api/scan/run': {
        post: {
          tags: ['Scan'],
          summary: 'Start scan',
          description: 'Triggers the CVE scan script (`scan.py`). Requires `editor` role.',
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    asset_ids: {
                      type: 'array',
                      items: { type: 'integer' },
                      description: 'Specific asset IDs to scan. Omit to scan all active assets.',
                    },
                  },
                },
              },
            },
          },
          responses: {
            202: {
              description: 'Scan started.',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/ScanStatus' } } },
            },
            401: { $ref: '#/components/responses/Unauthorized' },
            403: { $ref: '#/components/responses/Forbidden' },
            409: { $ref: '#/components/responses/Conflict' },
          },
        },
      },

      '/api/scan/status': {
        get: {
          tags: ['Scan'],
          summary: 'Get current scan status',
          description: 'Requires `editor` role.',
          responses: {
            200: {
              description: 'Current scan status.',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/ScanStatus' } } },
            },
            401: { $ref: '#/components/responses/Unauthorized' },
            403: { $ref: '#/components/responses/Forbidden' },
          },
        },
      },

      '/api/scan/cancel': {
        post: {
          tags: ['Scan'],
          summary: 'Cancel running scan',
          description: 'Requires `editor` role.',
          responses: {
            200: {
              description: 'Scan cancelled.',
              content: {
                'application/json': {
                  schema: { type: 'object', properties: { ok: { type: 'boolean' } } },
                },
              },
            },
            401: { $ref: '#/components/responses/Unauthorized' },
            403: { $ref: '#/components/responses/Forbidden' },
            409: { $ref: '#/components/responses/Conflict' },
          },
        },
      },

      '/api/scan/history': {
        get: {
          tags: ['Scan'],
          summary: 'Get scan history',
          description: 'Returns the last 20 scan runs. Requires `editor` role.',
          responses: {
            200: {
              description: 'Scan history.',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      runs: { type: 'array', items: { $ref: '#/components/schemas/ScanRun' } },
                    },
                  },
                },
              },
            },
            401: { $ref: '#/components/responses/Unauthorized' },
            403: { $ref: '#/components/responses/Forbidden' },
          },
        },
      },

      '/api/config/nist': {
        get: {
          tags: ['Config'],
          summary: 'Get NIST config',
          description: 'Requires `editor` role.',
          responses: {
            200: {
              description: 'NIST configuration.',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      'nist.api_key':   { type: 'string' },
                      'nist.page_size': { type: 'integer', example: 20 },
                    },
                  },
                },
              },
            },
            401: { $ref: '#/components/responses/Unauthorized' },
            403: { $ref: '#/components/responses/Forbidden' },
          },
        },
        put: {
          tags: ['Config'],
          summary: 'Save NIST config',
          description: 'Requires `editor` role.',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    'nist.api_key':   { type: 'string' },
                    'nist.page_size': { type: 'integer', example: 20 },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: 'Updated NIST configuration.' },
            400: { $ref: '#/components/responses/BadRequest' },
            401: { $ref: '#/components/responses/Unauthorized' },
            403: { $ref: '#/components/responses/Forbidden' },
          },
        },
      },

      '/api/config/ai': {
        get: {
          tags: ['Config'],
          summary: 'Get AI config',
          description: 'Requires `editor` role.',
          responses: {
            200: {
              description: 'AI configuration.',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      'ai.enabled':     { type: 'string', enum: ['true', 'false'] },
                      'ai.api_key_env': { type: 'string', description: 'Name of the environment variable that holds the Claude API key', example: 'ANTHROPIC_API_KEY' },
                      'ai.model':       { type: 'string', example: 'claude-sonnet-4-6' },
                    },
                  },
                },
              },
            },
            401: { $ref: '#/components/responses/Unauthorized' },
            403: { $ref: '#/components/responses/Forbidden' },
          },
        },
        put: {
          tags: ['Config'],
          summary: 'Save AI config',
          description: 'Requires `editor` role.',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    'ai.enabled':     { type: 'string', enum: ['true', 'false'] },
                    'ai.api_key_env': { type: 'string', description: 'Name of the environment variable that holds the Claude API key', example: 'ANTHROPIC_API_KEY' },
                    'ai.model':       { type: 'string', example: 'claude-sonnet-4-6' },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: 'Updated AI configuration.' },
            400: { $ref: '#/components/responses/BadRequest' },
            401: { $ref: '#/components/responses/Unauthorized' },
            403: { $ref: '#/components/responses/Forbidden' },
          },
        },
      },

      '/api/settings/api-keys': {
        get: {
          tags: ['API Keys'],
          summary: 'List API keys',
          description: 'Requires `editor` role. Keys are returned masked.',
          responses: {
            200: {
              description: 'List of API keys.',
              content: {
                'application/json': {
                  schema: { type: 'array', items: { $ref: '#/components/schemas/ApiKey' } },
                },
              },
            },
            401: { $ref: '#/components/responses/Unauthorized' },
            403: { $ref: '#/components/responses/Forbidden' },
          },
        },
        post: {
          tags: ['API Keys'],
          summary: 'Create API key',
          description: 'Returns the plaintext key **once only** — it cannot be retrieved again. Requires `editor` role.',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['name'],
                  properties: { name: { type: 'string', example: 'My Integration' } },
                },
              },
            },
          },
          responses: {
            201: {
              description: 'API key created.',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      id:         { type: 'integer' },
                      name:       { type: 'string' },
                      key:        { type: 'string', description: 'Plaintext key — shown once.' },
                      created_at: { type: 'string', format: 'date-time' },
                      warning:    { type: 'string' },
                    },
                  },
                },
              },
            },
            400: { $ref: '#/components/responses/BadRequest' },
            401: { $ref: '#/components/responses/Unauthorized' },
            403: { $ref: '#/components/responses/Forbidden' },
          },
        },
      },

      '/api/settings/api-keys/{id}': {
        delete: {
          tags: ['API Keys'],
          summary: 'Delete API key',
          description: 'Requires `editor` role.',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' }, example: 1 }],
          responses: {
            204: { description: 'API key deleted.' },
            401: { $ref: '#/components/responses/Unauthorized' },
            403: { $ref: '#/components/responses/Forbidden' },
            404: { $ref: '#/components/responses/NotFound' },
          },
        },
      },

      '/api/dashboard': {
        get: {
          tags: ['Dashboard'],
          summary: 'Get dashboard summary',
          description: 'Returns KPIs and CVE distribution for the dashboard.',
          responses: {
            200: {
              description: 'Dashboard data.',
              content: { 'application/json': { schema: { type: 'object' } } },
            },
            401: { $ref: '#/components/responses/Unauthorized' },
          },
        },
      },

      '/api/dashboard/assets': {
        get: {
          tags: ['Dashboard'],
          summary: 'Asset options for dashboard filters',
          responses: {
            200: {
              description: 'Minimal asset list for filter dropdowns.',
              content: {
                'application/json': {
                  schema: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        id:   { type: 'integer' },
                        name: { type: 'string' },
                      },
                    },
                  },
                },
              },
            },
            401: { $ref: '#/components/responses/Unauthorized' },
          },
        },
      },

      '/api/v1/export': {
        get: {
          tags: ['Export'],
          summary: 'Export security report',
          description: 'Returns the full security posture report sorted by risk. Accepts JWT cookie **or** `X-API-Key` header.',
          security: [{ cookieAuth: [] }, { apiKeyHeader: [] }],
          parameters: [
            { name: 'asset_id',    in: 'query', schema: { type: 'integer' },                           description: 'Filter by a specific asset.' },
            { name: 'severity',    in: 'query', schema: { type: 'string'  }, example: 'CRITICAL,HIGH', description: 'Comma-separated severity filter.' },
            { name: 'active_only', in: 'query', schema: { type: 'boolean', default: true },            description: 'Include only active assets.' },
          ],
          responses: {
            200: {
              description: 'Security report.',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/ExportReport' } } },
            },
            401: { $ref: '#/components/responses/Unauthorized' },
          },
        },
      },

      '/api/v1/assets/sync': {
        post: {
          tags: ['Sync'],
          summary: 'Bulk sync assets',
          description: 'Creates or updates assets in bulk. `X-API-Key` authentication **only** (no cookie).',
          security: [{ apiKeyHeader: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['assets'],
                  properties: {
                    assets: {
                      type: 'array',
                      items: {
                        type: 'object',
                        required: ['name', 'current_version'],
                        properties: {
                          name:            { type: 'string', example: 'nginx' },
                          tag:             { type: 'string', nullable: true, example: 'production' },
                          description:     { type: 'string', nullable: true },
                          url:             { type: 'string', nullable: true },
                          current_version: { type: 'string', example: '1.25.3' },
                          cve_start_date:  { type: 'string', format: 'date', description: 'Required when creating a new asset.', example: '2024-01-01' },
                          active:          { type: 'boolean', default: true },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          responses: {
            200: {
              description: 'Sync result.',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      created:   { type: 'integer' },
                      updated:   { type: 'integer' },
                      unchanged: { type: 'integer' },
                      errors: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            index: { type: 'integer' },
                            name:  { type: 'string', nullable: true },
                            tag:   { type: 'string', nullable: true },
                            error: { type: 'string' },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
            400: { $ref: '#/components/responses/BadRequest' },
            401: { $ref: '#/components/responses/Unauthorized' },
          },
        },
      },
    },
  };
}

const SWAGGER_UI_VERSION = '5.17.14';

const HTML = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>ShadowRadar — API Docs</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@${SWAGGER_UI_VERSION}/swagger-ui.css" />
  <style>
    body { margin: 0; }
    .swagger-ui .topbar { display: none; }
  </style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@${SWAGGER_UI_VERSION}/swagger-ui-bundle.js"></script>
  <script>
    SwaggerUIBundle({
      url: '/api/docs/spec',
      dom_id: '#swagger-ui',
      deepLinking: true,
      withCredentials: true,
      presets: [SwaggerUIBundle.presets.apis, SwaggerUIBundle.SwaggerUIStandalonePreset],
      layout: 'BaseLayout',
    });
  </script>
</body>
</html>`;

router.get('/spec', (_req, res) => res.json(buildSpec()));

router.get('/', (_req, res) => {
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' https://unpkg.com 'unsafe-inline' 'unsafe-eval'; style-src 'self' https://unpkg.com 'unsafe-inline'; img-src 'self' data:; connect-src 'self'",
  );
  res.type('html').send(HTML);
});

module.exports = router;
