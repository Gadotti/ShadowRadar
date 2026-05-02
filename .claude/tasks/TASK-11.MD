# TASK-11 — APIs de Integração Externa

## Objetivo
Implementar a API de exportação de resultados no formato definido pela spec, a API de
importação/atualização de ativos via upsert, e o sistema de API Keys para autenticação
dessas rotas externas.

## Referências da spec
- Seção 7.1 — API de Exportação de Resultados
- Seção 7.2 — API de Importação/Atualização de Ativos
- Seção 8 — API Keys (hash, geração única, header X-API-Key)

## Dependências
- TASK-01 (banco)
- TASK-02 (autenticação — referência para o padrão de hash)
- TASK-03 (assetRepository)
- TASK-08 (cveRepository)

## Entregáveis

### Sistema de API Keys

**Migration adicional** (nova migration no sistema de migrations):

```sql
CREATE TABLE api_keys (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  name      TEXT NOT NULL,
  key_hash  TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  last_used_at TEXT
);
```

A API Key é exibida apenas uma vez no momento de geração (plain text). Somente o hash é armazenado.

### `src/repositories/apiKeyRepository.js`
- `create(db, { name, keyHash })` → id
- `findByHash(db, keyHash)` → api_key ou undefined
- `listAll(db)` → array sem `key_hash` (somente id, name, created_at, last_used_at)
- `updateLastUsed(db, id)` → void
- `remove(db, id)` → void

### `src/services/apiKeyService.js`
- `generateKey()` → string aleatória de 40 caracteres (hex ou base64url)
- `hashKey(plainKey)` → hash SHA-256 da key
- `createApiKey(db, name)` → `{ id, name, plainKey }` — plainKey exibida apenas aqui
- `validateKey(db, plainKey)` → api_key record ou null

### `src/middleware/authenticateApiKey.js`
- Lê o header `X-API-Key`
- Valida via `apiKeyService.validateKey`
- Atualiza `last_used_at`
- Retorna `401` se ausente ou inválida

### `src/api/apiKeyRoutes.js`
Requerem autenticação JWT + role `editor`.

| Método | Rota | Descrição |
|---|---|---|
| `GET` | `/api/settings/api-keys` | Lista API Keys (sem o valor real) |
| `POST` | `/api/settings/api-keys` | Gera nova API Key (retorna plain text UMA VEZ) |
| `DELETE` | `/api/settings/api-keys/:id` | Revoga API Key |

**`POST /api/settings/api-keys` — Body:**
```json
{ "name": "CI/CD Pipeline" }
```

**Resposta (única vez com a key real):**
```json
{
  "id": 1,
  "name": "CI/CD Pipeline",
  "key": "sr_a1b2c3d4e5f6...",
  "created_at": "2026-05-01T14:00:00Z",
  "warning": "Guarde esta chave. Ela não será exibida novamente."
}
```

### `src/api/exportRoutes.js`
Aceita autenticação via cookie JWT **ou** header `X-API-Key`.

**`GET /api/v1/export`**

Query params:

| Param | Tipo | Padrão |
|---|---|---|
| `asset_id` | integer | — (todos) |
| `severity` | string | — (todos) |
| `active_only` | boolean | `true` |

**Regras de construção da resposta** (conforme spec 7.1):

| Campo | Origem |
|---|---|
| `last_scan` | `MAX(finished_at)` de `scan_runs WHERE status='completed'`; formato `YYYY-MM-DD HH:MM:SS` |
| `id` | `{name}_{current_version}` com espaços → `_` |
| `pubEndDate_checked` | `MAX(scanned_at)` dos CVEs do ativo; formato `YYYY-MM-DD` |
| `cve.assessment` | `user_assessment` ou `""` se NULL |
| `cve.claude_ai_assessment` | `ai_assessment` ou `""` se NULL |
| `risk` | Severidade mais alta excluindo `Not Affected` e `False Positive`; capitalizada (`Low`, `High`) |
| `alert` | Derivado de `risk` conforme tabela da seção 6.6 |

**Ordenação:** `report_items` por risco decrescente; CVEs por `published_date` decrescente.

**Formato exato da resposta:**
```json
{
  "last_scan": "2026-05-01 14:31:41",
  "report_items": [
    {
      "id": "FortiOS_7.4.11",
      "name": "FortiOS",
      "url": "https://meusite.com",
      "current_version": "7.4.11",
      "pubEndDate_checked": "2026-05-01",
      "cves": [
        {
          "cve_id": "CVE-2026-25815",
          "description": "...",
          "severity": "LOW",
          "published_date": "2026-02-05",
          "assessment": "",
          "claude_ai_assessment": "Versão 7.4.11 está dentro da faixa afetada"
        }
      ],
      "risk": "Low",
      "alert": "No immediate action required"
    }
  ]
}
```

### `src/api/syncRoutes.js`
Autenticação via `X-API-Key` obrigatória (não aceita JWT).

**`POST /api/v1/assets/sync`**

Body:
```json
{
  "assets": [
    {
      "name": "MyApp",
      "tag": "#server-a",
      "description": "...",
      "url": "https://...",
      "current_version": "2.3.1",
      "cve_start_date": "2023-01-01",
      "active": true
    }
  ]
}
```

**Regras de upsert:**
- Matching por `name` + `tag`
- `tag` ausente no body é tratado como `null`
- Se não existe: cria novo ativo
- Se existe: atualiza `current_version`, `url`, `description`, `active`
- `cve_start_date` nunca sobrescrita se já definida no banco
- Cada item processado independentemente; erros de um item não bloqueiam os demais

**Resposta:**
```json
{
  "created": 1,
  "updated": 2,
  "unchanged": 0,
  "errors": [
    { "index": 2, "name": "MyApp", "tag": "#broken", "error": "current_version is required" }
  ]
}
```

### Integração no frontend (`#/config/ai` ou nova aba `#/settings`)
Adicionar seção de gerenciamento de API Keys na interface (somente `editor`):
- Tabela com keys existentes: nome, data de criação, último uso
- Botão "Gerar nova API Key" → modal com campo nome → exibe a key gerada com aviso de copiar
- Botão "Revogar" por linha (com confirmação)

> **Nota:** Esta seção pode ser adicionada em uma nova rota `#/settings` ou incorporada em uma das telas de config existentes — decidir durante implementação conforme melhor UX.

## Como validar

1. `POST /api/settings/api-keys` (como editor) → retorna key plain text
2. `GET /api/settings/api-keys` → lista sem revelar os valores reais
3. `DELETE /api/settings/api-keys/:id` → key revogada
4. `GET /api/v1/export` com `X-API-Key` válida → retorna payload no formato exato
5. `GET /api/v1/export` com `X-API-Key` inválida → 401
6. `GET /api/v1/export` com cookie JWT → também funciona
7. `GET /api/v1/export?active_only=true` → somente ativos ativos
8. `GET /api/v1/export?severity=CRITICAL` → somente CVEs CRITICAL
9. CVE com `user_assessment = 'Not Affected'` → excluído do cálculo de `risk`
10. Ativo sem CVEs → `risk = 'None'`, `alert = 'No known vulnerabilities'`
11. `POST /api/v1/assets/sync` com `X-API-Key` → cria e atualiza conforme regras
12. `POST /api/v1/assets/sync` com ativo existente → `cve_start_date` não sobrescrita
13. `POST /api/v1/assets/sync` sem `X-API-Key` → 401
14. `POST /api/v1/assets/sync` com item inválido → item com erro na lista `errors`, demais processados
15. UI de API Keys: gerar key → modal exibe valor, botão de copiar funciona
