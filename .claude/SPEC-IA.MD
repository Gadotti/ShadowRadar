# ShadowRadar — Especificação do Sistema

## 1. Visão Geral

O **ShadowRadar** é uma aplicação web para **External Security Posture Management (ESPM)**.
Seu objetivo é monitorar ativos externos da organização — aplicações web, serviços SaaS, APIs de terceiros
e qualquer componente que não pode ser mapeado automaticamente pela rede interna — consultando a base
de CVEs do NIST e avaliando se as versões em produção estão expostas a vulnerabilidades conhecidas.

A análise de cada CVE pode ser feita **manualmente pelo analista de segurança** ou **automaticamente
com auxílio de IA via API**, gerando um registro rastreável de cada avaliação realizada.

O scan de CVEs é executado por um **script externo em Python** que lê as configurações do banco e
escreve os resultados de volta. A aplicação Node.js é responsável pela interface, autenticação,
configuração, APIs e pelo acionamento do script.

---

## 2. Requisitos Não Funcionais

| Atributo | Decisão |
|---|---|
| Banco de dados | SQLite com WAL mode (arquivo local, sem servidor externo) |
| Backend | Node.js (LTS estável) |
| Frontend | Vanilla JS — HTML + CSS + ES Modules nativos, sem framework ou bundler |
| Interface | Clean e minimalista — paleta neutra, sem elementos desnecessários |
| Testabilidade | Arquitetura orientada a injeção de dependências; cobertura via testes unitários |
| Princípios de código | SOLID + regras definidas em `CODE-STANDARDS.MD` |
| Acessibilidade | Semântica HTML básica; navegação por teclado nos formulários |
| Script de scan | Python 3 (externo ao Node.js) |

---

## 3. Arquitetura de Alto Nível

```
┌──────────────────────────────────────────────────────┐
│               Frontend (Vanilla JS)                   │
│  Dashboard │ Ativos │ Resultados │ Scan │ Config      │
│  HTML + CSS + ES Modules │ Chart.js via CDN           │
└──────────────────────┬───────────────────────────────┘
                       │ HTTP/REST + fetch API
┌──────────────────────▼───────────────────────────────┐
│                  Backend (Node.js)                    │
│  Auth │ Assets │ CVEs │ Scan Trigger │ AI Engine      │
└──────┬───────────────────────┬────────────────────────┘
       │ SQLite (better-sqlite3)│ child_process.spawn
┌──────▼──────────┐    ┌───────▼────────┐    ┌─────────────────────┐
│  Local Database │    │  scan.py       │    │  External APIs       │
│  shadowradar.db │    │  (Python)      │    │  - NIST NVD API      │
│                 │◄───│  lê/escreve DB │    │  - Claude API (opt.) │
└─────────────────┘    └───────┬────────┘    └─────────────────────┘
                               │ HTTP
                               └──────────────────────────────────▲
```

### 3.1 Responsabilidades por Camada

| Camada | Responsabilidades |
|---|---|
| **Frontend Vanilla JS** | Renderização de páginas, chamadas fetch, roteamento hash-based, gráficos |
| **Backend Node.js** | Auth, CRUD de ativos, leitura de CVEs, API de exportação/importação, acionar `scan.py` |
| **scan.py (Python)** | Consultar NIST NVD API, popular `asset_cves`, chamar Claude API (se configurado), registrar `scan_runs` |

### 3.2 Estrutura de Diretórios

```
shadowradar/
├── src/                   # Backend Node.js
│   ├── api/               # Rotas HTTP (controllers finos)
│   ├── services/          # Lógica de negócio
│   ├── repositories/      # Queries SQLite (injetáveis)
│   ├── integrations/      # Clientes externos (NIST, Claude)
│   ├── middleware/        # Auth, validação, error handler
│   ├── models/            # Estruturas de dados e validações
│   ├── db/                # Migrations e inicialização do banco
│   └── server.js          # Entry point
├── public/                # Frontend estático servido pelo Express
│   ├── index.html
│   ├── css/
│   │   └── styles.css
│   ├── js/
│   │   ├── app.js         # Entry point — roteamento hash-based
│   │   ├── api.js         # Wrapper centralizado para fetch
│   │   ├── pages/         # Módulo por página (dashboard.js, assets.js, ...)
│   │   └── components/    # Componentes reutilizáveis (sidebar.js, table.js, ...)
│   └── vendor/            # Libs de terceiros (Chart.js local)
├── scripts/
│   ├── scan.py            # Script externo de scan
│   └── create-user.js     # CLI para criação de usuários
├── data/
│   └── shadowradar.db     # Banco SQLite
└── tests/                 # Testes unitários
```

### 3.3 Roteamento Frontend

O frontend usa **hash-based routing** (`#/dashboard`, `#/assets`, `#/results`). Não requer
bundler nem servidor com suporte a rewrite de rotas. O `app.js` lê o `window.location.hash`
e renderiza o módulo correspondente na área de conteúdo principal.

---

## 4. Modelo de Dados

### 4.1 Tabela `users`

| Coluna | Tipo | Restrições |
|---|---|---|
| `id` | INTEGER | PK, autoincrement |
| `name` | TEXT | NOT NULL — nome de exibição do usuário |
| `username` | TEXT | UNIQUE, NOT NULL — login |
| `password_hash` | TEXT | NOT NULL (bcrypt) |
| `role` | TEXT | `reader` \| `editor` — padrão `reader` |
| `created_at` | TEXT | ISO 8601 |

**Papéis:**
- `reader` — acesso somente leitura: visualiza dashboard, ativos, resultados e histórico de scans
- `editor` — leitura + gravação: tudo do `reader` + criar/editar/excluir ativos, disparar scan, editar avaliações de CVEs, salvar configurações

### 4.2 Tabela `assets`

| Coluna | Tipo | Restrições |
|---|---|---|
| `id` | INTEGER | PK, autoincrement |
| `name` | TEXT | NOT NULL |
| `tag` | TEXT | Identificador curto para diferenciar ativos com mesmo nome (ex: `#1`, `#server-a`) \| NULL |
| `description` | TEXT | Descrição livre e informativa do ativo |
| `url` | TEXT | |
| `current_version` | TEXT | NOT NULL |
| `cve_start_date` | TEXT | `YYYY-MM-DD` — data inicial para busca de CVEs no NIST |
| `active` | INTEGER | 0 ou 1, padrão 1 |
| `created_at` | TEXT | ISO 8601 |
| `updated_at` | TEXT | ISO 8601 |

> Múltiplos ativos com o mesmo `name` são permitidos. Quando `tag` for preenchida, o par `name` + `tag` deve ser único.
> Ativos sem `tag` não participam desta restrição de unicidade.
> A coluna `url` não tem restrição de unicidade.

### 4.3 Tabela `asset_cves`

| Coluna | Tipo | Restrições |
|---|---|---|
| `id` | INTEGER | PK, autoincrement |
| `asset_id` | INTEGER | FK → assets.id, CASCADE DELETE |
| `cve_id` | TEXT | Ex: `CVE-2024-12345` |
| `description` | TEXT | Descrição original do NIST |
| `severity` | TEXT | `CRITICAL` \| `HIGH` \| `MEDIUM` \| `LOW` \| `NONE` |
| `cvss_score` | REAL | Score CVSS (0.0–10.0) |
| `published_at` | TEXT | `YYYY-MM-DD` |
| `user_assessment` | TEXT | Ver valores abaixo \| NULL (sem avaliação) |
| `user_notes` | TEXT | Observações livres do analista |
| `ai_assessment` | TEXT | Texto da avaliação da IA (Claude) \| NULL |
| `scanned_at` | TEXT | ISO 8601 — último momento em que o NIST foi consultado |
| `evaluated_at` | TEXT | ISO 8601 — momento da última avaliação (IA ou usuário) |

**Valores de `user_assessment`:**

| Valor | Significado |
|---|---|
| `Acknowledge/Mitigating` | CVE reconhecido; mitigação em andamento |
| `Accepted Risk` | Risco aceito conscientemente; sem ação planejada |
| `Not Affected` | Versão do ativo não é afetada por este CVE |
| `False Positive` | CVE não se aplica de fato ao ativo |
| NULL | Sem avaliação — aparece como "Pending" na interface |

> CVEs com `user_assessment = 'Not Affected'` ou `'False Positive'` são excluídos do
> cálculo de **risco geral** do ativo na exportação e na visão macro.

### 4.4 Tabela `scan_runs`

| Coluna | Tipo | Restrições |
|---|---|---|
| `id` | INTEGER | PK, autoincrement |
| `started_at` | TEXT | `YYYY-MM-DD HH:MM:SS` |
| `finished_at` | TEXT | `YYYY-MM-DD HH:MM:SS` \| NULL |
| `status` | TEXT | `running` \| `completed` \| `failed` |
| `assets_scanned` | INTEGER | |
| `cves_found` | INTEGER | |
| `error_message` | TEXT | NULL se sucesso |

> Escrita pelo `scan.py`. Lida pelo backend Node.js para exibir histórico e indicador de último scan.

### 4.5 Tabela `config`

| Coluna | Tipo | Restrições |
|---|---|---|
| `key` | TEXT | PK |
| `value` | TEXT | NOT NULL |
| `updated_at` | TEXT | ISO 8601 |

> Armazena configurações gerais em chave-valor. Lida tanto pelo Node.js quanto pelo `scan.py`.

**Chaves esperadas na tabela `config`:**

| Chave | Descrição |
|---|---|
| `nist.page_size` | CVEs por página na consulta ao NIST (padrão: 50) |
| `nist.api_key` | API Key do NIST (opcional) |
| `ai.enabled` | `true` \| `false` |
| `ai.api_url` | URL da API Claude |
| `ai.api_key` | API Key (armazenada em hash) |
| `ai.model` | ID do modelo Claude |
| `ai.max_tokens` | Máximo de tokens por resposta |
| `ai.temperature` | Temperature (0.0–1.0) |
| `ai.batch_size` | CVEs por requisição à IA |
| `scan.script_path` | Caminho para o `scan.py` (padrão: `./scripts/scan.py`) |

---

## 5. Autenticação e Sessão

A autenticação utiliza **JWT assinado em cookie `httpOnly`**.

### Implementação

- Login gera um JWT assinado com `HS256` e validade de **30 dias**
- JWT entregue em cookie com flags: `httpOnly; SameSite=Strict; Secure` (Secure apenas em produção)
- Inacessível a JavaScript do cliente — protegido contra XSS
- JWT auto-suficiente: contém `userId`, `username` e `role`; não requer consulta ao banco por requisição
- Sessão persiste entre reinicializações do servidor sem estado no banco
- Logout limpa o cookie no cliente; o JWT expira naturalmente em 30 dias

### Endpoints de Auth

| Método | Rota | Descrição |
|---|---|---|
| `POST` | `/api/auth/login` | Valida credenciais; retorna cookie JWT |
| `POST` | `/api/auth/logout` | Limpa cookie (resposta 200 idempotente) |
| `GET` | `/api/auth/me` | Retorna dados do usuário autenticado atual |

### Middleware de Autenticação

- Aplicado a todas as rotas `/api/*` exceto `/api/auth/login`
- Extrai e valida o JWT do cookie
- Injeta `req.user = { id, username, role }` no request
- Respostas: `401` se sem cookie ou token inválido; `403` se role insuficiente

### Middleware de Autorização por Role

```
reader:  GET  em /api/assets, /api/cves, /api/results, /api/dashboard, /api/scans
editor:  tudo do reader + POST/PUT/DELETE em todos os recursos + POST /api/scan/run
```

---

## 6. Módulos Funcionais

### 6.1 Menu Lateral

- Menu lateral esquerdo, colapsável
- **Expandido:** ícone + rótulo de cada página
- **Recolhido:** apenas ícones (com tooltip ao hover)
- Estado de expansão persiste no `localStorage` (única informação de UI neste storage)
- Rodapé do menu exibe: número da versão da aplicação (lida do `version.json`) e botão de logout
- Itens do menu (visíveis para ambos os papéis, exceto onde indicado):

| Item | Rota hash | Restrito a |
|---|---|---|
| Dashboard | `#/dashboard` | — |
| Ativos | `#/assets` | — |
| Resultados / CVEs | `#/results` | — |
| Scan | `#/scan` | `editor` |
| Config — NIST | `#/config/nist` | `editor` |
| Config — IA | `#/config/ai` | `editor` |

### 6.2 Cadastro de Ativos

**Campos do formulário:**

| Campo | Tipo | Obrigatório | Observação |
|---|---|---|---|
| Nome | Texto | Sim | — |
| Tag | Texto | Não | Identificador curto para diferenciar ativos com mesmo nome (ex: `#1`, `#server-a`) |
| Descrição | Textarea | Não | Texto livre e informativo; não é chave de identificação |
| URL | URL | Não | — |
| Versão Atual | Texto | Sim | Usada pelo `scan.py` na consulta ao NIST |
| Data Inicial CVEs | Data | Sim | `YYYY-MM-DD`; define `pubStartDate` na API NIST |
| Ativo | Toggle on/off | Sim | Padrão: ativo |

**Regras:**
- Múltiplos ativos com o mesmo nome são permitidos (ambientes diferentes, versões diferentes)
- Quando `tag` for preenchida, o par `name` + `tag` deve ser único — erro de validação se duplicado
- A `cve_start_date` filtra CVEs históricos irrelevantes — não pode ser futura
- Ativos inativos não participam de novos scans
- Exclusão de ativo remove em cascata todos os seus CVEs (`CASCADE DELETE`)
- Ações de criação/edição/exclusão requerem role `editor`

**Listagem de ativos:**
- Tabela com colunas: Nome, Tag, Descrição, Versão, Status, Data do último scan, Total CVEs, Ações
- Ações visíveis para `editor`: Editar, Ativar/Desativar, Excluir
- Paginação (padrão 20 registros/página)
- Busca por nome, tag ou descrição

### 6.3 Tela de Scan

Esta tela é exclusiva para usuários com role `editor`.

**Finalidade:** configurar e acionar manualmente o script `scan.py`. O agendamento automático
não é responsabilidade desta aplicação nesta versão — pode ser feito externamente via cron do SO.

#### Painel de Configuração do Scan

| Campo | Tipo | Padrão | Persistência |
|---|---|---|---|
| Caminho do script | Texto | `./scripts/scan.py` | `config.scan.script_path` |
| Escopo | Radio: Todos os ativos ativos \| Ativo específico | Todos | Não persiste |
| Ativo específico | Select (visível se escopo = específico) | — | Não persiste |

#### Acionamento

- Botão **"Executar Scan"** disponível somente quando não há scan em andamento
- O backend dispara `scan.py` via `child_process.spawn` passando o caminho do banco como argumento:
  ```
  python scan.py --db ./data/shadowradar.db [--asset-id 42]
  ```
- Durante execução, o botão é substituído por indicador de progresso e botão "Cancelar"
- Cancelar envia `SIGTERM` ao processo filho e marca o `scan_run` como `failed`

#### Progresso em Tempo Real

- Backend expõe `GET /api/scan/status` (polling a cada 3s pelo frontend)
- Retorna o `scan_run` com status `running`, assets processados até o momento e CVEs encontrados
- Ao concluir (`completed` ou `failed`), frontend para o polling e exibe resultado final

#### Histórico de Scans

- Tabela abaixo do painel exibindo os últimos 20 registros de `scan_runs`
- Colunas: Data/hora de início, Duração, Status, Ativos escaneados, CVEs encontrados, Mensagem de erro
- Ordenação: mais recente primeiro

#### Interface do `scan.py` com o banco

O script lê da tabela `config` todas as suas configurações e da tabela `assets` os ativos a processar.
Escreve em `asset_cves` (insert/update) e `scan_runs` (status, contadores).

```
# Argumentos CLI esperados pelo scan.py
--db        Caminho para o arquivo .db (obrigatório)
--asset-id  ID de ativo específico (opcional; se omitido, processa todos os ativos com active=1)
```

### 6.4 Configuração da Fonte de CVEs (NIST)

> Esta tela é para configuração apenas da fonte NIST, que é a única disponível nesta versão.
> A estrutura está preparada para suportar outras fontes no futuro.

**Campos:**

| Campo | Tipo | Padrão | Read-only? |
|---|---|---|---|
| Fonte ativa | Texto | NIST NVD API | Sim |
| URL base | Texto | `https://services.nvd.nist.gov/rest/json/cves/2.0` | Sim |
| Resultados por página | Número | 50 | **Não** (mín: 1, máx: 2000) |
| API Key (opcional) | Password | — | **Não** |

**Rate limiting:**
- Sem API Key: 5 requisições / 30 segundos (o `scan.py` respeita com delay automático)
- Com API Key: 50 requisições / 30 segundos
- Exibir aviso na interface se API Key não estiver configurada

### 6.5 Configuração da Integração com IA

**Campos:**

| Campo | Tipo | Padrão | Descrição |
|---|---|---|---|
| Integração ativa | Toggle | Desativado | Liga/desliga uso de IA pelo `scan.py` |
| Provedor | Select | Claude | Somente Claude nesta versão |
| URL da API | URL | `https://api.anthropic.com` | Permite proxy corporativo ou AWS Bedrock |
| API Key | Password | — | Mascarado após salvar; armazenado em hash no banco |
| Modelo | Texto | `claude-sonnet-4-6` | ID do modelo Claude a utilizar |
| Max tokens | Número | 16000 | Tokens máximos por resposta |
| Temperature | Decimal | 0 | 0.0 a 1.0 |
| Batch size | Número | 20 | CVEs enviados por requisição à Claude API |

**Comportamento da avaliação por IA (executada pelo `scan.py`):**
- Acionada ao final do scan NIST se `ai.enabled = true`
- CVEs com `ai_assessment` já preenchido não são reenviados (evitar custo), salvo reprocessamento forçado
- Prompt enviado por CVE inclui: `cve_id`, `description`, `severity`, `cvss_score`, `asset.name`, `asset.current_version`
- A IA retorna um texto de avaliação (`ai_assessment`) — não uma escala de risco, mas análise contextual
- Erros de API da IA são logados e registrados no `scan_runs.error_message`; o scan continua normalmente

### 6.6 Tela de Resultados / CVEs

**Indicador de último scan** (topo da página):
- Data/hora do último `scan_run` com `status = completed`
- Alerta visual se último scan foi há mais de 7 dias

**Duas visões alternáveis por toggle:**

#### Visão Lista (padrão)

Tabela paginada de CVEs (padrão 50/página):

| Coluna | Ordenável | Filtrável |
|---|---|---|
| CVE ID | Sim | Texto livre |
| Ativo (nome + versão) | Sim | Multi-select |
| Descrição | Não | Texto livre |
| Severidade NIST | Sim | Multi-select: CRITICAL / HIGH / MEDIUM / LOW / NONE |
| CVSS Score | Sim | Range numérico |
| Data de publicação | Sim | Range de datas |
| Avaliação do Usuário | Sim | Multi-select: valores definidos + "Pending" (sem avaliação) |
| Avaliação IA | Não | Com avaliação / Sem avaliação |
| Ações | Não | — |

**Ações por linha (role `editor`):**
- Editar avaliação do usuário — abre modal com:
  - Select: `Acknowledge/Mitigating` / `Accepted Risk` / `Not Affected` / `False Positive` / (limpar avaliação)
  - Textarea: observações livres
- Ver detalhes do CVE — painel lateral com todos os campos incluindo texto completo da avaliação IA
- Reprocessar via IA — força reenvio mesmo se `ai_assessment` já preenchido

#### Visão Macro (por ativo)

Tabela agrupada por ativo, calculada excluindo CVEs com avaliação `Not Affected` ou `False Positive`:

| Coluna | Descrição |
|---|---|
| Ativo (nome + versão) | — |
| Total CVEs | Contagem total (todos, inclusive excluídos do risco) |
| Crítico | Contagem por severidade NIST |
| Alto | Contagem por severidade NIST |
| Médio | Contagem por severidade NIST |
| Baixo | Contagem por severidade NIST |
| Sem avaliação | CVEs com `user_assessment IS NULL` |
| Risco Geral | Severidade mais alta excluindo Not Affected e False Positive |
| Alerta | Mensagem derivada do Risco Geral (ver tabela abaixo) |
| Último scan | `scanned_at` mais recente entre os CVEs do ativo |

**Tabela de Risco Geral → Alerta:**

| Risco Geral | Alerta |
|---|---|
| CRITICAL | `Immediate action required` |
| HIGH | `Action required` |
| MEDIUM | `Review recommended` |
| LOW | `No immediate action required` |
| NONE / sem CVEs ativos | `No known vulnerabilities` |

**Filtros gerais (ambas as visões):**
- Por ativo(s) específico(s)
- Por severidade NIST
- Por avaliação do usuário (incluindo "Sem avaliação")
- Por período de publicação do CVE
- Ativos ativos / inativos / todos

### 6.7 Dashboard

**KPI Cards:**

| Indicador | Fonte |
|---|---|
| Total de ativos ativos | `COUNT(assets WHERE active=1)` |
| Total de CVEs | `COUNT(asset_cves)` |
| CVEs sem avaliação | `COUNT WHERE user_assessment IS NULL` |
| CVEs em mitigação | `COUNT WHERE user_assessment = 'Acknowledge/Mitigating'` |

**Gráficos:**

| Componente | Tipo | Dados |
|---|---|---|
| Distribuição por severidade NIST | Donut | CRITICAL / HIGH / MEDIUM / LOW / NONE |
| CVEs por ativo | Barras horizontais | Top 10 ativos por volume total de CVEs |
| Evolução de CVEs no tempo | Linha | CVEs descobertos por mês (published_at) |
| Distribuição por avaliação do usuário | Pizza | 4 valores + Pending (sem avaliação) |
| Cobertura de avaliação IA | Gauge | % de CVEs com `ai_assessment` preenchido |

**Biblioteca de gráficos:** Chart.js (arquivo local em `public/vendor/chart.js`)

**Filtros do dashboard:**
- Por ativo(s) — multi-select
- Por período (últimos 30 / 90 / 180 dias ou range customizado)
- Por severidade NIST

---

## 7. APIs Externas (Integração)

### 7.1 API de Exportação de Resultados

Exporta o posture report consolidado, agrupado por ativo com seus CVEs.

**Endpoint:** `GET /api/v1/export`

**Autenticação:** Cookie JWT de sessão ou header `X-API-Key` com chave gerada nas configurações

**Query params:**

| Parâmetro | Tipo | Descrição |
|---|---|---|
| `asset_id` | integer | Filtrar por ativo específico |
| `severity` | string | Severidades separadas por vírgula (`CRITICAL,HIGH`) |
| `active_only` | boolean | Somente ativos com `active=1` (padrão: `true`) |

**Formato da resposta:**

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
                    "description": "Fortinet FortiOS through 7.6.6 allows...",
                    "severity": "LOW",
                    "published_date": "2026-02-05",
                    "assessment": "",
                    "claude_ai_assessment": "Versão 7.4.11 está dentro da faixa afetada (through 7.6.6)"
                }
            ],
            "risk": "Low",
            "alert": "No immediate action required"
        }
    ]
}
```

**Regras de construção da resposta:**

| Campo | Origem |
|---|---|
| `last_scan` | `MAX(finished_at)` de `scan_runs WHERE status='completed'`; formato `YYYY-MM-DD HH:MM:SS` |
| `id` | `{asset.name}_{asset.current_version}` com espaços substituídos por `_` |
| `pubEndDate_checked` | `MAX(scanned_at)` dos CVEs do ativo; formato `YYYY-MM-DD` |
| `cve.assessment` | `user_assessment` ou string vazia se NULL |
| `cve.claude_ai_assessment` | `ai_assessment` ou string vazia se NULL |
| `risk` | Severidade mais alta entre CVEs com `user_assessment NOT IN ('Not Affected', 'False Positive')`; capitalizada (ex: `Low`, `High`) |
| `alert` | Derivado do `risk` conforme tabela da seção 6.6 |

**Ordenação:** `report_items` ordenados por risco decrescente (CRITICAL primeiro); CVEs ordenados por `published_date` decrescente.

### 7.2 API de Importação/Atualização de Ativos

Permite que sistemas externos (ex: pipelines CI/CD) registrem novos ativos ou atualizem versões.

**Endpoint:** `POST /api/v1/assets/sync`

**Autenticação:** Header `X-API-Key` com chave gerada nas configurações (não requer sessão de usuário)

**Body:**
```json
{
    "assets": [
        {
            "name": "MyApp",
            "tag": "#server-a",
            "description": "Instância de produção no Servidor A",
            "url": "https://app.example.com",
            "current_version": "2.3.1",
            "cve_start_date": "2023-01-01",
            "active": true
        }
    ]
}
```

**Regras de upsert:**
- Matching por `name` + `tag` (par identifica unicamente o ativo)
- Se não existir: cria novo ativo
- Se existir: atualiza `current_version`, `url`, `description` e `active`
- `cve_start_date` nunca é sobrescrita se já definida — preserva o histórico configurado

**Resposta:**
```json
{
    "created": 1,
    "updated": 2,
    "unchanged": 0,
    "errors": []
}
```

---

## 8. Segurança

- Senhas armazenadas com `bcrypt` (salt rounds ≥ 12)
- JWT assinado com `HS256`; secret via variável de ambiente com entropia mínima de 256 bits
- Todas as queries SQLite via prepared statements — sem interpolação de strings
- API Keys armazenadas com hash; exibidas somente no momento de geração
- Campos sensíveis (API Keys) mascarados na UI após salvo
- Headers de segurança via `helmet.js`: `Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options`
- Rate limiting nas rotas de autenticação: máximo 10 tentativas por IP em 15 minutos
- Validação e sanitização de todos os inputs via biblioteca de schema (ex: `joi`)
- CORS configurado explicitamente; sem wildcard `*` em produção
- `Content-Security-Policy` permite Chart.js apenas se carregado localmente (sem CDN externo em produção)

---

## 9. Configuração e Deploy

### 9.1 Variáveis de Ambiente

```env
PORT=3500
NODE_ENV=production
DB_PATH=./data/shadowradar.db
JWT_SECRET=<string aleatória ≥ 32 caracteres>
LOG_LEVEL=info
```

### 9.2 Scripts npm

```json
{
    "start": "node src/server.js",
    "dev": "node --watch src/server.js",
    "test": "node --test tests/**/*.test.js",
    "db:migrate": "node src/db/migrate.js",
    "db:seed": "node src/db/seed.js",
    "create-user": "node scripts/create-user.js"
}
```

> Não há etapa de build — nem para o backend (JavaScript puro) nem para o frontend (arquivos estáticos em `public/` servidos diretamente pelo Express).

### 9.3 Migrations

- Schema inicializado via script de migration versionado (`db:migrate`)
- Migration executada automaticamente ao iniciar a aplicação se necessário
- Tabela `_migrations` registra versões aplicadas
- O `scan.py` espera o schema já criado — nunca executa migrations

**Pragmas obrigatórios aplicados na abertura da conexão** (tanto no Node.js quanto no `scan.py`):

```sql
PRAGMA journal_mode=WAL;
PRAGMA synchronous=NORMAL;
PRAGMA foreign_keys=ON;
```

> `WAL` (Write-Ahead Logging) permite que Node.js e `scan.py` acessem o banco simultaneamente
> sem corrupção: múltiplos leitores operam em paralelo e dois escritores concorrentes são enfileirados
> sem bloqueio. `synchronous=NORMAL` mantém durabilidade adequada com melhor desempenho de escrita.
> `foreign_keys=ON` é necessário pois o SQLite não habilita FKs por padrão.

### 9.4 Script de Criação de Usuários (`create-user.js`)

O script `scripts/create-user.js` é a única forma de criar usuários no sistema.
Não existe interface de gerenciamento de usuários na aplicação web.

**Uso:**
```
npm run create-user
```

**Fluxo interativo:**

```
Nome de exibição: Eduardo Gadotti
Usuário (login): eduardo
Papel [reader/editor]: editor
Senha: ********
Confirmar senha: ********

Usuário 'eduardo' criado com sucesso (papel: editor).
```

**Regras:**
- Solicita confirmação de senha; não cria o usuário se as senhas não coincidirem
- Valida que o `username` não existe antes de inserir (erro amigável se duplicado)
- Valida que o `role` é `reader` ou `editor`
- Senha armazenada com `bcrypt` (salt rounds ≥ 12)
- Requer que o banco já esteja inicializado (`npm run db:migrate` antes)
- Não tem dependências externas além de `bcrypt` e `better-sqlite3` (já usados pelo servidor)

### 9.5 Dependências Python (`scan.py`)

O script Python requer:
```
requests>=2.31
```
Nenhuma dependência além da stdlib + requests. Documentado no arquivo `scripts/requirements.txt`.

---

## 10. Comportamentos Esperados por Cenário

| Cenário | Comportamento |
|---|---|
| NIST API indisponível durante scan | `scan_run` marcado como `failed`; CVEs existentes preservados; mensagem de erro exibida no histórico |
| Claude API retorna erro durante scan | CVE permanece com `ai_assessment = NULL`; erro registrado; scan NIST continua normalmente |
| Script `scan.py` não encontrado | Backend retorna erro 500 com mensagem clara; nenhum `scan_run` é criado |
| Ativo inativado com CVEs existentes | CVEs preservados para histórico; ativo excluído de novos scans |
| CVE já existente em novo scan | Campos NIST atualizados (`severity`, `cvss_score`, `description`); `user_assessment` e `ai_assessment` preservados |
| Importação via API com ativo já existente | Matched por `name + tag`; versão atualizada sem duplicar registro |
| Usuário `reader` tenta ação de `editor` | Resposta `403 Forbidden`; ação bloqueada no middleware |
| Logout com sessão já expirada | Resposta `200` (idempotente); cookie limpo |
| Dois scans disparados simultaneamente | Segundo disparo retorna erro `409 Conflict`; apenas um processo `scan.py` por vez |

---

## 11. Fora do Escopo desta Versão

- Agendamento automático de scan (responsabilidade do SO via cron ou scheduler externo)
- Múltiplas fontes de CVEs além do NIST NVD
- Notificações por email ou webhook ao detectar novos CVEs críticos
- Autenticação via SSO / LDAP / OAuth
- Gerenciamento de usuários pela interface web (criação feita via `npm run create-user`; sem UI de admin)
- Modo multi-tenant (múltiplas organizações)
- Scanner ativo de rede (ShadowRadar monitora exclusivamente ativos não mapeáveis pela rede)
- Integração com provedores de IA além do Claude
- Exportação em formato CSV
