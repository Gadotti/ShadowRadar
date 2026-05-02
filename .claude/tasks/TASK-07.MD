# TASK-07 — Tela e Backend de Scan

## Objetivo
Implementar o acionamento do script `scan.py` pelo backend Node.js, o endpoint de status
com polling e a tela de scan com painel de configuração, progresso e histórico.

## Referências da spec
- Seção 4.4 — Tabela `scan_runs`
- Seção 6.3 — Tela de Scan (completo)
- Seção 10 — Cenários: script não encontrado, scan simultâneo, cancelamento

## Dependências
- TASK-01 (banco e tabela scan_runs)
- TASK-02 (autenticação)
- TASK-04 (shell do frontend)
- TASK-06 (config service — para ler `scan.script_path`)

## Entregáveis

### `src/repositories/scanRepository.js`
- `createRun(db, { started_at })` → id do novo scan_run com `status = 'running'`
- `updateRun(db, id, { status, finished_at, assets_scanned, cves_found, error_message })` → void
- `getRunById(db, id)` → scan_run ou undefined
- `getCurrentRun(db)` → scan_run com `status = 'running'` ou undefined
- `listRuns(db, limit)` → array dos últimos N scan_runs ordenados por `started_at DESC`
- `getLastCompletedRun(db)` → scan_run mais recente com `status = 'completed'`

### `src/services/scanService.js`

**Estado interno do módulo:** referência ao processo filho em execução (`childProcess`).

- `getCurrentStatus(db)` → `{ running: bool, current_run: scan_run | null }`
- `startScan(db, { assetId? })`:
  1. Verifica se já há scan em andamento → lança `ConflictError` se sim
  2. Lê `scan.script_path` da config
  3. Verifica se o arquivo do script existe → lança `NotFoundError` com mensagem clara se não
  4. Insere registro em `scan_runs` com `status = 'running'`
  5. Dispara `child_process.spawn('python', [scriptPath, '--db', dbPath, ...])` com `assetId` se fornecido
  6. Ao finalizar (evento `close`): atualiza `scan_run` com `status = 'completed'` ou `'failed'`
  7. Retorna `{ scan_run_id }`
- `cancelScan(db)`:
  1. Verifica se há processo filho ativo
  2. Envia `SIGTERM` ao processo
  3. Atualiza `scan_run` para `status = 'failed'`, `error_message = 'Cancelled by user'`

**Observações:**
- O `scan.py` escreve diretamente no banco; o Node.js apenas monitora o `scan_run` via polling
- Stderr do processo filho deve ser capturado e logado; não bloqueia o fluxo
- Processo filho herda as variáveis de ambiente necessárias

### `src/api/scanRoutes.js`
Todas as rotas requerem `editor`.

| Método | Rota | Descrição |
|---|---|---|
| `POST` | `/api/scan/run` | Inicia o scan (dispara scan.py) |
| `GET` | `/api/scan/status` | Retorna status do scan atual |
| `POST` | `/api/scan/cancel` | Cancela o scan em andamento |
| `GET` | `/api/scan/history` | Lista histórico de scan_runs |

**`POST /api/scan/run` — Body (opcional):**
```json
{ "asset_id": 42 }
```
- Sem `asset_id`: processa todos os ativos ativos
- Resposta 202: `{ "scan_run_id": 7 }`
- Resposta 409 se já em andamento
- Resposta 500 se script não encontrado (com mensagem clara)

**`GET /api/scan/status`:**
```json
{
  "running": true,
  "current_run": {
    "id": 7,
    "started_at": "2026-05-01 14:30:00",
    "status": "running",
    "assets_scanned": 3,
    "cves_found": 12,
    "error_message": null
  }
}
```

**`GET /api/scan/history`:**
```json
{
  "runs": [
    {
      "id": 7,
      "started_at": "2026-05-01 14:30:00",
      "finished_at": "2026-05-01 14:31:41",
      "status": "completed",
      "assets_scanned": 5,
      "cves_found": 28,
      "error_message": null,
      "duration_seconds": 101
    }
  ]
}
```

### `public/js/pages/scan.js`
Módulo ES com função `render(container, currentUser)`.

#### Painel de Configuração

**Campos:**
- Caminho do script (texto, pré-carregado da config)
- Escopo: radio "Todos os ativos ativos" / "Ativo específico"
- Select de ativo (visível apenas se escopo = específico; carrega de `GET /api/assets?active=1`)

#### Controles de Execução

- **Estado idle:** botão "Executar Scan" habilitado
- **Estado running:** botão desabilitado + spinner + texto "Scan em andamento..." + botão "Cancelar"
- **Estado pós-conclusão:** exibe resultado (ativos escaneados, CVEs encontrados, duração)

#### Progresso em Tempo Real

- Ao clicar "Executar": inicia polling `GET /api/scan/status` a cada 3 segundos
- Exibe contadores atualizados: "Ativos processados: X | CVEs encontrados: Y"
- Quando `status !== 'running'`: para polling e exibe estado final
- Se `status = 'failed'`: exibe `error_message` em destaque

#### Histórico de Scans

Tabela abaixo do painel com as últimas 20 execuções:

| Coluna | Descrição |
|---|---|
| Data/hora | `started_at` formatado |
| Duração | `duration_seconds` em formato legível (ex: `1m 41s`) |
| Status | Badge: completed (verde) / failed (vermelho) / running (azul) |
| Ativos | `assets_scanned` |
| CVEs | `cves_found` |
| Erro | `error_message` truncado (hover mostra completo) |

## Como validar

1. `GET /api/scan/status` → `{ running: false, current_run: null }`
2. `POST /api/scan/run` com `scan.py` inexistente → 500 com mensagem clara
3. Criar um `scan.py` stub que dorme 5s e escreve um `scan_run` de teste
4. `POST /api/scan/run` → 202; `GET /api/scan/status` → `running: true`
5. `POST /api/scan/run` durante scan ativo → 409
6. `GET /api/scan/status` após conclusão → `running: false`, run com `status = completed`
7. `GET /api/scan/history` → retorna lista com o run concluído
8. Abrir `#/scan` como editor → painel carregado com path da config
9. Executar scan via UI → botão desaparece, spinner aparece
10. Contador de progresso atualiza a cada 3s
11. Ao concluir → resultado exibido, historico atualizado
12. Botão "Cancelar" durante execução → scan marcado como failed
13. Tentar acessar `#/scan` como `reader` → redirecionado para `#/dashboard`
