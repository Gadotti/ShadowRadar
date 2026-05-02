# TASK-03 — CRUD de Ativos (Backend)

## Objetivo
Implementar a API REST completa de gerenciamento de ativos: listagem com filtros e paginação,
criação, edição, exclusão e ativação/desativação.

## Referências da spec
- Seção 4.2 — Tabela `assets`
- Seção 6.2 — Cadastro de Ativos (regras de negócio)
- Seção 10 — Comportamentos por cenário (unicidade name+tag, CASCADE DELETE)

## Dependências
- TASK-01 (banco e servidor)
- TASK-02 (autenticação e middlewares)

## Entregáveis

### `src/repositories/assetRepository.js`
Funções que recebem `db` como parâmetro:
- `findAll(db, { search, active, page, pageSize })` → `{ items, total }`
- `findById(db, id)` → asset ou undefined
- `findByNameAndTag(db, name, tag)` → asset ou undefined
- `create(db, assetData)` → id do novo asset
- `update(db, id, assetData)` → asset atualizado
- `remove(db, id)` → void (CASCADE DELETE cuida dos CVEs)
- `setActive(db, id, active)` → void
- `getLastScanDate(db, id)` → data ISO ou null
- `getCveCount(db, id)` → número inteiro

### `src/services/assetService.js`
- `listAssets(db, filters)` → lista paginada enriquecida com `last_scan` e `cve_count`
- `getAsset(db, id)` → asset ou lança `NotFoundError`
- `createAsset(db, data)` → valida e cria; lança `ValidationError` se name+tag duplicado
- `updateAsset(db, id, data)` → valida e atualiza
- `deleteAsset(db, id)` → remove (CVEs removidos em cascata)
- `toggleActive(db, id)` → inverte estado active

**Validações em `createAsset` e `updateAsset`:**
- `name`: obrigatório, string não vazia
- `current_version`: obrigatório, string não vazia
- `cve_start_date`: obrigatório, formato `YYYY-MM-DD`, não pode ser data futura
- `tag`: opcional; se preenchida, verificar unicidade do par `(name, tag)` (excluindo o próprio id no caso de update)
- `active`: boolean, padrão `true`

### `src/api/assetRoutes.js`
Todas as rotas requerem autenticação. Rotas de escrita requerem role `editor`.

| Método | Rota | Role | Descrição |
|---|---|---|---|
| `GET` | `/api/assets` | any | Lista ativos com filtros e paginação |
| `GET` | `/api/assets/:id` | any | Retorna ativo por ID |
| `POST` | `/api/assets` | editor | Cria novo ativo |
| `PUT` | `/api/assets/:id` | editor | Atualiza ativo |
| `DELETE` | `/api/assets/:id` | editor | Remove ativo e seus CVEs |
| `PATCH` | `/api/assets/:id/toggle` | editor | Ativa ou desativa ativo |

**`GET /api/assets` — Query params:**

| Param | Tipo | Descrição |
|---|---|---|
| `search` | string | Filtra por name, tag ou description (LIKE) |
| `active` | `0\|1\|all` | Padrão: `all` |
| `page` | integer | Padrão: 1 |
| `page_size` | integer | Padrão: 20 |

**Resposta de `GET /api/assets`:**
```json
{
  "items": [
    {
      "id": 1,
      "name": "Nginx",
      "tag": "#server-a",
      "description": "...",
      "url": "https://...",
      "current_version": "1.24.0",
      "active": 1,
      "cve_start_date": "2023-01-01",
      "cve_count": 5,
      "last_scan": "2026-05-01 14:31:41",
      "created_at": "...",
      "updated_at": "..."
    }
  ],
  "total": 42,
  "page": 1,
  "page_size": 20
}
```

**Respostas de erro:**
- `400` com `{ error: "mensagem de validação" }` para erros de input
- `404` com `{ error: "Asset not found" }` para ID inexistente
- `409` com `{ error: "Asset with this name and tag already exists" }` para duplicata

### Integração em `src/server.js`
- Montar `assetRoutes` em `/api`

## Como validar

1. `POST /api/assets` (como editor) com dados válidos → 201, retorna ativo criado
2. `POST /api/assets` com name+tag duplicado → 409
3. `POST /api/assets` com `cve_start_date` futura → 400
4. `POST /api/assets` sem `name` → 400
5. `GET /api/assets` → retorna lista com `cve_count` e `last_scan`
6. `GET /api/assets?search=nginx` → filtra corretamente
7. `GET /api/assets?active=1` → somente ativos ativos
8. `GET /api/assets/:id` → retorna ativo específico
9. `GET /api/assets/9999` → 404
10. `PUT /api/assets/:id` → atualiza dados
11. `PATCH /api/assets/:id/toggle` → inverte estado `active`
12. `DELETE /api/assets/:id` → remove ativo; verificar no banco que CVEs foram removidos em cascata
13. Tentar qualquer escrita com usuário `reader` → 403
14. Tentar qualquer rota sem autenticação → 401
