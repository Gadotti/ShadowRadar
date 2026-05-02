# TASK-12 — Script de Scan (`scan.py`)

## Objetivo
Implementar o script Python que consulta a API NIST NVD para cada ativo ativo,
popula/atualiza a tabela `asset_cves` e opcionalmente envia CVEs para avaliação
via Claude API. O script é invocado pelo Node.js mas também pode ser executado standalone.

## Referências da spec
- Seção 3.1 — Responsabilidades do `scan.py`
- Seção 4.3 — Tabela `asset_cves`
- Seção 4.4 — Tabela `scan_runs`
- Seção 4.5 — Tabela `config` (chaves lidas pelo script)
- Seção 6.3 — Interface do `scan.py` com o banco
- Seção 6.5 — Comportamento da avaliação por IA
- Seção 9.5 — Dependências Python
- Seção 10 — Cenários: NIST indisponível, Claude com erro, CVE já existente

## Dependências
- TASK-01 (banco e schema criados; `npm run db:migrate` já executado)

## Entregáveis

### `scripts/requirements.txt`
```
requests>=2.31
```

### `scripts/scan.py`

#### Argumentos CLI
```
python scan.py --db <path_to_db> [--asset-id <id>]
```
- `--db`: caminho para o arquivo `.db` (obrigatório)
- `--asset-id`: processa somente este ativo (opcional; sem ele processa todos com `active=1`)

#### Estrutura interna do script

```
scan.py
├── main()                         # Entry point; parse de args, orquestra o fluxo
├── load_config(db)                # Lê todas as chaves config.* do banco
├── get_assets(db, asset_id=None)  # Retorna lista de ativos a processar
├── scan_asset(db, asset, config)  # Processa um ativo: NIST + upsert CVEs
├── fetch_nist_cves(asset, config) # Consulta paginada à NIST API
├── upsert_cve(db, asset_id, cve)  # Insert ou update em asset_cves
├── run_ai_assessment(db, config)  # Envia CVEs sem avaliação ao Claude
├── send_batch_to_claude(batch, config) # Requisição à API do Claude
└── update_scan_run(db, run_id, ...) # Atualiza scan_runs
```

#### Fluxo principal (`main`)

1. Parsear argumentos `--db` e `--asset-id`
2. Abrir conexão SQLite com os mesmos pragmas WAL:
   ```python
   conn.execute("PRAGMA journal_mode=WAL")
   conn.execute("PRAGMA synchronous=NORMAL")
   conn.execute("PRAGMA foreign_keys=ON")
   ```
3. Carregar config do banco via `load_config`
4. Criar registro em `scan_runs` com `status = 'running'`, `started_at = now()`
5. Carregar lista de ativos via `get_assets`
6. Para cada ativo: chamar `scan_asset`; atualizar contadores em `scan_runs`
7. Se `ai.enabled = 'true'`: chamar `run_ai_assessment`
8. Atualizar `scan_runs` com `status = 'completed'`, `finished_at = now()`
9. Em caso de exceção não tratada: atualizar `scan_runs` com `status = 'failed'`, `error_message`

#### `fetch_nist_cves(asset, config)`

Consulta a NVD API com paginação:

```
GET https://services.nvd.nist.gov/rest/json/cves/2.0
  ?keywordSearch={asset.name}
  &pubStartDate={asset.cve_start_date}T00:00:00.000Z
  &resultsPerPage={config.nist.page_size}
  &startIndex={offset}
```

- Headers: `apiKey: {nist.api_key}` se configurada
- Pagina até esgotar todos os resultados (`totalResults`)
- **Rate limiting automático:**
  - Sem API Key: aguarda 6 segundos entre requisições (5 req/30s)
  - Com API Key: aguarda 0.6 segundos entre requisições (50 req/30s)
- Retry com backoff em erros 429 ou 503 (máx 3 tentativas)
- Retorna lista normalizada de CVEs:

```python
{
  'cve_id': 'CVE-2024-12345',
  'description': '...',       # en; fallback para primeiro idioma disponível
  'severity': 'HIGH',         # baseado em cvssMetricV31 ou v30 ou v2
  'cvss_score': 7.5,
  'published_at': '2024-03-15'
}
```

**Extração de severidade:** prioridade `cvssMetricV31` > `cvssMetricV30` > `cvssMetricV2`.
Se nenhuma disponível: `severity = 'NONE'`, `cvss_score = 0.0`.

#### `upsert_cve(db, asset_id, cve)`

- Verificar se `(asset_id, cve_id)` já existe em `asset_cves`
- **Se novo:** inserir com `user_assessment = NULL`, `ai_assessment = NULL`
- **Se existente:** atualizar somente campos do NIST:
  - `description`, `severity`, `cvss_score`, `scanned_at`
  - **Preservar:** `user_assessment`, `user_notes`, `ai_assessment`, `evaluated_at`

#### `run_ai_assessment(db, config)`

Envia CVEs sem `ai_assessment` em batches para a Claude API:

1. Buscar CVEs com `ai_assessment IS NULL` no banco (todos os ativos)
2. Agrupar em batches de tamanho `config.ai.batch_size`
3. Para cada batch: chamar `send_batch_to_claude`
4. Persistir `ai_assessment` retornado para cada CVE

#### `send_batch_to_claude(batch, config)`

```python
POST {config.ai.api_url}/v1/messages
Headers:
  x-api-key: {config.ai.api_key}
  anthropic-version: 2023-06-01
Body:
  model: {config.ai.model}
  max_tokens: {config.ai.max_tokens}
  temperature: {config.ai.temperature}
  messages: [{ role: 'user', content: <prompt> }]
```

**Prompt template (por CVE no batch):**
```
Você é um analista de segurança. Para cada CVE abaixo, forneça uma análise
contextual em uma ou duas frases sobre se a versão específica do ativo é
afetada, com base nas informações disponíveis.

Formato de resposta: JSON array com objetos { "cve_id": "...", "assessment": "..." }

CVEs para análise:
[
  {
    "cve_id": "CVE-2024-12345",
    "asset_name": "Nginx",
    "asset_version": "1.24.0",
    "description": "...",
    "severity": "HIGH",
    "cvss_score": 7.5
  }
]
```

- Parse da resposta JSON do Claude
- Se erro de parse ou API: logar e continuar (CVEs ficam com `ai_assessment = NULL`)
- Não re-processa CVEs que já têm `ai_assessment`

#### Logging
- Saída estruturada para stdout: uma linha por evento significativo
- Formato: `[TIMESTAMP] [LEVEL] mensagem`
- Eventos: início de scan, ativo processado, CVEs encontrados, erros, conclusão
- Stderr apenas para erros fatais

#### Tratamento de erros
- NIST indisponível (timeout/503): ativo marcado como falho nos contadores; scan continua para próximo ativo
- Claude com erro: CVEs ficam sem `ai_assessment`; scan não é marcado como failed por este motivo
- Banco inacessível: abort imediato com código de saída 1

## Como validar

1. `python scripts/scan.py --help` → exibe uso
2. `python scripts/scan.py --db data/shadowradar.db` sem ativos → `scan_runs` com `completed`, `assets_scanned=0`
3. Com 1 ativo cadastrado: `python scan.py --db ...` → CVEs inseridos em `asset_cves`
4. Executar novamente → CVEs existentes atualizados com campos NIST; `user_assessment` preservado
5. `python scan.py --db ... --asset-id 2` → processa somente o ativo 2
6. Simular NIST indisponível (URL errada na config) → scan falha mas `scan_runs` atualizado com `error_message`
7. Verificar rate limiting: com API Key ausente, delay ≥ 6s entre páginas (logar timestamp)
8. Com IA ativa e API Key Claude válida: CVEs recebem `ai_assessment` após o scan
9. Segunda execução com IA: CVEs já avaliados não são reenviados ao Claude
10. Executar com Claude com API Key inválida → erro logado; CVEs sem ai_assessment; scan marcado como `completed` (não `failed`)
11. Verificar `scan_runs.finished_at` preenchido em todos os cenários (sucesso e erro)
12. Verificar que Node.js consegue iniciar o script via `POST /api/scan/run` e ler `scan_runs` durante execução
