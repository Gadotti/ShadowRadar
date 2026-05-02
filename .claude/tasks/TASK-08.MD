# TASK-08 — CVEs: Backend

## Objetivo
Implementar os endpoints de leitura, filtro, paginação, ordenação e edição de avaliações
dos CVEs. Incluir as queries de agregação necessárias para a visão macro por ativo.

## Referências da spec
- Seção 4.3 — Tabela `asset_cves` e valores de `user_assessment`
- Seção 6.6 — Tela de Resultados / CVEs (filtros, ordenação, visão macro, lógica de risco)
- Seção 10 — Cenário: CVE já existente em novo scan (campos NIST atualizados, avaliações preservadas)

## Dependências
- TASK-01 (banco)
- TASK-02 (autenticação)
- TASK-03 (assetRepository — para joins)

## Entregáveis

### `src/repositories/cveRepository.js`

**Listagem paginada com filtros:**
- `findAll(db, filters)` → `{ items, total }`

Filtros suportados:
```js
{
  asset_id,          // integer
  search,            // text livre (cve_id ou description)
  severity,          // array: ['CRITICAL','HIGH',...]
  user_assessment,   // array de valores + 'PENDING' (NULL)
  has_ai_assessment, // boolean
  published_after,   // YYYY-MM-DD
  published_before,  // YYYY-MM-DD
  active_assets_only,// boolean
  page,
  page_size,
  order_by,          // coluna
  order_dir          // ASC | DESC
}
```

**Agregação para visão macro:**
- `getMacroView(db, { asset_id, severity, active_assets_only })` → array de objetos por ativo:
```js
{
  asset_id, asset_name, asset_tag, asset_version, last_scan,
  total: N,
  critical: N, high: N, medium: N, low: N, none: N,
  pending: N,        // user_assessment IS NULL
  risk: 'HIGH',      // severidade mais alta excluindo Not Affected e False Positive
  alert: 'Action required'
}
```

**Lógica de `risk` e `alert`:**
- CVEs com `user_assessment IN ('Not Affected', 'False Positive')` são excluídos do cálculo
- Ordem de prioridade: CRITICAL > HIGH > MEDIUM > LOW > NONE
- Se não há CVEs elegíveis: risk = NONE, alert = 'No known vulnerabilities'

| risk | alert |
|---|---|
| CRITICAL | `Immediate action required` |
| HIGH | `Action required` |
| MEDIUM | `Review recommended` |
| LOW | `No immediate action required` |
| NONE | `No known vulnerabilities` |

**Outros métodos:**
- `findById(db, id)` → cve ou undefined
- `updateAssessment(db, id, { user_assessment, user_notes })` → void; atualiza `evaluated_at`
- `getLastScanInfo(db)` → `{ last_completed_at }` do `scan_runs`

### `src/services/cveService.js`
- `listCves(db, filters)` → chama repository, enriquece com nome do ativo
- `getMacroView(db, filters)` → chama repository
- `updateAssessment(db, id, data)` → valida `user_assessment` contra os 4 valores permitidos + NULL; atualiza

**Valores válidos de `user_assessment`:**
- `Acknowledge/Mitigating`
- `Accepted Risk`
- `Not Affected`
- `False Positive`
- `null` (limpar avaliação)

### `src/api/cveRoutes.js`

| Método | Rota | Role | Descrição |
|---|---|---|---|
| `GET` | `/api/cves` | any | Lista CVEs com filtros e paginação |
| `GET` | `/api/cves/macro` | any | Visão agregada por ativo |
| `GET` | `/api/cves/:id` | any | Retorna CVE completo |
| `PUT` | `/api/cves/:id/assessment` | editor | Atualiza avaliação do usuário |

**`GET /api/cves` — Query params:**

| Param | Tipo | Exemplo |
|---|---|---|
| `asset_id` | integer | `1` |
| `search` | string | `CVE-2024` |
| `severity` | string | `CRITICAL,HIGH` |
| `user_assessment` | string | `PENDING,Accepted Risk` |
| `has_ai_assessment` | `true\|false` | `true` |
| `published_after` | YYYY-MM-DD | `2024-01-01` |
| `published_before` | YYYY-MM-DD | `2024-12-31` |
| `active_assets_only` | `true\|false` | `true` |
| `page` | integer | `1` |
| `page_size` | integer | `50` |
| `order_by` | string | `severity` |
| `order_dir` | `ASC\|DESC` | `DESC` |

**Resposta de `GET /api/cves`:**
```json
{
  "items": [
    {
      "id": 1,
      "cve_id": "CVE-2024-12345",
      "asset_id": 2,
      "asset_name": "Nginx",
      "asset_tag": "#server-a",
      "asset_version": "1.24.0",
      "description": "...",
      "severity": "HIGH",
      "cvss_score": 7.5,
      "published_at": "2024-03-15",
      "user_assessment": null,
      "user_notes": null,
      "ai_assessment": "Versão 1.24.0 está dentro da faixa afetada...",
      "scanned_at": "2026-05-01T14:31:41.000Z",
      "evaluated_at": null
    }
  ],
  "total": 128,
  "page": 1,
  "page_size": 50,
  "last_scan": "2026-05-01 14:31:41"
}
```

**`PUT /api/cves/:id/assessment` — Body:**
```json
{
  "user_assessment": "Accepted Risk",
  "user_notes": "Versão corrigida em rollout."
}
```
- `user_assessment`: um dos 4 valores válidos ou `null`
- Retorna o CVE atualizado

## Como validar

1. Popular o banco com CVEs de teste via seed ou scan.py stub
2. `GET /api/cves` → retorna lista paginada com dados do ativo
3. `GET /api/cves?severity=CRITICAL,HIGH` → somente CVEs com essas severidades
4. `GET /api/cves?user_assessment=PENDING` → somente CVEs sem avaliação (NULL)
5. `GET /api/cves?search=CVE-2024` → filtra por cve_id
6. `GET /api/cves?order_by=cvss_score&order_dir=DESC` → ordenado corretamente
7. `GET /api/cves?page=2&page_size=10` → paginação correta
8. `GET /api/cves/macro` → retorna agregação por ativo com risk e alert corretos
9. CVE com todos `Not Affected` → risk = NONE, alert = 'No known vulnerabilities'
10. `PUT /api/cves/:id/assessment` com valor válido → atualiza e retorna CVE com `evaluated_at` preenchido
11. `PUT /api/cves/:id/assessment` com `user_assessment: null` → limpa avaliação
12. `PUT /api/cves/:id/assessment` com valor inválido → 400
13. Tentar `PUT` como `reader` → 403
