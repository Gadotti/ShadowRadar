# TASK-10 — Dashboard (Backend + Frontend)

## Objetivo
Implementar os endpoints de dados agregados para o dashboard e a página com
KPI cards, gráficos (Chart.js) e filtros.

## Referências da spec
- Seção 6.7 — Dashboard (KPI cards, gráficos, filtros)

## Dependências
- TASK-08 (cveRepository com queries de agregação)
- TASK-04 (shell do frontend, Chart.js local)

## Entregáveis

### `src/repositories/dashboardRepository.js`
Queries SQLite otimizadas para os dados do dashboard. Recebe filtros como parâmetro.

**Filtros suportados por todas as queries:**
```js
{
  asset_ids,       // array de IDs ou vazio = todos
  published_after, // YYYY-MM-DD
  published_before // YYYY-MM-DD
}
```

**Funções:**
- `getKpis(db, filters)` → objeto com os 4 KPIs
- `getSeverityDistribution(db, filters)` → contagem por severity
- `getCvesByAsset(db, filters)` → top 10 ativos por total de CVEs
- `getCvesByMonth(db, filters)` → contagem por mês (published_at)
- `getAssessmentDistribution(db, filters)` → contagem por user_assessment (+ PENDING para NULL)
- `getAiCoverage(db, filters)` → `{ total, with_ai, percentage }`

### `src/services/dashboardService.js`
- `getDashboardData(db, filters)` → agrega e retorna todos os dados em um único objeto
- `getAssetOptions(db)` → lista simplificada de ativos para o filtro de seleção

### `src/api/dashboardRoutes.js`

| Método | Rota | Role | Descrição |
|---|---|---|---|
| `GET` | `/api/dashboard` | any | Retorna todos os dados do dashboard |
| `GET` | `/api/dashboard/assets` | any | Lista ativos para filtro (id + nome + tag) |

**`GET /api/dashboard` — Query params:**

| Param | Tipo | Descrição |
|---|---|---|
| `asset_ids` | string | IDs separados por vírgula (`1,2,5`) |
| `period` | string | `30d`, `90d`, `180d` ou `custom` |
| `date_from` | YYYY-MM-DD | Obrigatório se `period=custom` |
| `date_to` | YYYY-MM-DD | Obrigatório se `period=custom` |
| `severity` | string | Severidades separadas por vírgula |

**Resposta de `GET /api/dashboard`:**
```json
{
  "kpis": {
    "active_assets": 12,
    "total_cves": 287,
    "cves_pending_assessment": 143,
    "cves_mitigating": 31
  },
  "severity_distribution": {
    "CRITICAL": 14, "HIGH": 52, "MEDIUM": 98, "LOW": 89, "NONE": 34
  },
  "cves_by_asset": [
    { "asset_id": 1, "asset_name": "FortiOS", "asset_tag": "#fw-01", "total": 45 }
  ],
  "cves_by_month": [
    { "month": "2025-11", "count": 12 },
    { "month": "2025-12", "count": 19 }
  ],
  "assessment_distribution": {
    "Acknowledge/Mitigating": 31,
    "Accepted Risk": 22,
    "Not Affected": 45,
    "False Positive": 18,
    "Pending": 143
  },
  "ai_coverage": {
    "total": 287,
    "with_ai": 201,
    "percentage": 70.0
  }
}
```

### `public/js/pages/dashboard.js`
Módulo ES com função `render(container, currentUser)`.

#### Painel de Filtros

- Multi-select de ativos (carregado de `GET /api/dashboard/assets`)
- Selector de período: `Últimos 30 dias` / `Últimos 90 dias` / `Últimos 180 dias` / `Personalizado`
  - Se personalizado: dois date pickers (De / Até)
- Multi-select de severidade
- Botão "Aplicar" — requisita dados com os filtros selecionados
- Botão "Limpar"

#### KPI Cards (4 cards no topo)

| Card | Valor | Cor |
|---|---|---|
| Ativos Monitorados | `active_assets` | Neutro |
| Total de CVEs | `total_cves` | Neutro |
| Sem Avaliação | `cves_pending_assessment` | Amarelo |
| Em Mitigação | `cves_mitigating` | Azul |

#### Gráficos (abaixo dos cards)

Layout em grade 2×2 (ou adaptável):

**1. Distribuição por Severidade** — Donut (Chart.js)
- Dataset: `severity_distribution`
- Cores: CRITICAL=vermelho, HIGH=laranja, MEDIUM=amarelo, LOW=azul, NONE=cinza
- Legenda com contagem

**2. CVEs por Ativo** — Barras horizontais (Chart.js)
- Dataset: `cves_by_asset` (top 10)
- Eixo X: contagem; Eixo Y: nome do ativo (+ tag se preenchida)

**3. Evolução de CVEs por Mês** — Linha (Chart.js)
- Dataset: `cves_by_month`
- Eixo X: mês/ano; Eixo Y: quantidade
- Últimos 12 meses visíveis por padrão

**4. Distribuição por Avaliação do Usuário** — Pizza (Chart.js)
- Dataset: `assessment_distribution`
- Cores distintas para cada avaliação + Pending
- Legenda com percentual

**5. Cobertura de Avaliação IA** — Gauge (simulado com donut de 2 segmentos)
- Porcentagem de CVEs com `ai_assessment` preenchido
- Exibir número percentual no centro do donut

**Estados:**
- Loading: placeholders durante carregamento
- Vazio: cada gráfico exibe "Sem dados para o período" se não há registros

## Como validar

1. `GET /api/dashboard` → retorna estrutura completa com todos os campos
2. `GET /api/dashboard?period=30d` → dados filtrados pelo período
3. `GET /api/dashboard?asset_ids=1,2` → dados apenas para esses ativos
4. `GET /api/dashboard?severity=CRITICAL,HIGH` → dados filtrados por severidade
5. Acessar `#/dashboard` → 4 KPI cards exibidos com valores corretos
6. Gráfico de donut de severidade → 5 segmentos com cores corretas
7. Gráfico de barras por ativo → limitado ao top 10
8. Gráfico de linha por mês → eixo X com meses formatados
9. Gráfico de pizza de avaliação → inclui "Pending" para CVEs sem avaliação
10. Gauge de cobertura IA → percentual correto
11. Filtrar por período 30d → todos os gráficos e KPIs atualizam
12. Selecionar período personalizado → date pickers aparecem
13. Selecionar ativos específicos → dados filtrados
14. Limpar filtros → volta para o estado padrão
15. Dashboard com banco vazio → gráficos exibem "Sem dados"
