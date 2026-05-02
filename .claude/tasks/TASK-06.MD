# TASK-06 — Configurações (Backend + Frontend)

## Objetivo
Implementar as telas e APIs de configuração da fonte NIST e da integração com IA (Claude).
Os valores são lidos e escritos na tabela `config` do banco.

## Referências da spec
- Seção 4.5 — Tabela `config` e suas chaves
- Seção 6.4 — Configuração da Fonte de CVEs (NIST)
- Seção 6.5 — Configuração da Integração com IA

## Dependências
- TASK-01 (banco e tabela config)
- TASK-02 (autenticação)
- TASK-04 (shell do frontend)

## Entregáveis

### `src/repositories/configRepository.js`
- `get(db, key)` → valor ou undefined
- `getAll(db)` → objeto `{ key: value, ... }`
- `set(db, key, value)` → upsert na tabela config
- `setMany(db, entries)` → upsert em transação para múltiplas chaves

### `src/services/configService.js`
- `getNistConfig(db)` → objeto com todas as chaves `nist.*`
- `saveNistConfig(db, { page_size, api_key })` → valida e salva
- `getAiConfig(db)` → objeto com todas as chaves `ai.*`; `api_key` retornada mascarada (`****`)
- `saveAiConfig(db, data)` → valida e salva; `api_key` não sobrescreve se valor enviado for `****`

**Validações em `saveNistConfig`:**
- `page_size`: inteiro entre 1 e 2000

**Validações em `saveAiConfig`:**
- `enabled`: boolean
- `api_url`: URL válida
- `max_tokens`: inteiro positivo
- `temperature`: decimal entre 0.0 e 1.0
- `batch_size`: inteiro entre 1 e 100

### `src/api/configRoutes.js`
Todas as rotas requerem `editor`.

| Método | Rota | Descrição |
|---|---|---|
| `GET` | `/api/config/nist` | Retorna configuração NIST atual |
| `PUT` | `/api/config/nist` | Salva configuração NIST |
| `GET` | `/api/config/ai` | Retorna configuração IA atual (api_key mascarada) |
| `PUT` | `/api/config/ai` | Salva configuração IA |

**Respostas de `GET /api/config/nist`:**
```json
{
  "source_name": "NIST NVD API",
  "base_url": "https://services.nvd.nist.gov/rest/json/cves/2.0",
  "page_size": 50,
  "api_key": "****"
}
```

**Respostas de `GET /api/config/ai`:**
```json
{
  "enabled": false,
  "provider": "Claude",
  "api_url": "https://api.anthropic.com",
  "api_key": "****",
  "model": "claude-sonnet-4-6",
  "max_tokens": 16000,
  "temperature": 0,
  "batch_size": 20
}
```

### `public/js/pages/configNist.js`
Módulo ES com função `render(container, currentUser)`.

**Layout:**
- Seção informativa (read-only): Fonte ativa e URL base
- Seção editável: Resultados por página e API Key
- Aviso de destaque se API Key não estiver configurada (rate limit reduzido)
- Botão "Salvar"

**Comportamento:**
- Carrega valores atuais via `GET /api/config/nist`
- API Key exibida como placeholder `****` se já configurada; campo limpo indica "não alterar"
- Salva via `PUT /api/config/nist`
- Toast de sucesso/erro após salvar

### `public/js/pages/configAi.js`
Módulo ES com função `render(container, currentUser)`.

**Layout:**
- Toggle de ativação/desativação no topo
- Campos de configuração (desabilitados se toggle = off)
- Select de provedor (somente Claude nesta versão — read-only)
- Campos: URL da API, API Key, Modelo, Max Tokens, Temperature, Batch Size
- Botão "Salvar"

**Comportamento:**
- Carrega valores atuais via `GET /api/config/ai`
- API Key: mesmo comportamento de mascaramento da config NIST
- Toggle off → campos ficam visualmente desabilitados (mas ainda editáveis para configurar antes de ativar)
- Salva via `PUT /api/config/ai`
- Toast de sucesso/erro após salvar

## Como validar

1. `GET /api/config/nist` (como editor) → retorna valores padrão
2. `PUT /api/config/nist` com `page_size=100` → valor persiste no banco
3. `PUT /api/config/nist` com `page_size=5000` → 400
4. `GET /api/config/ai` → `api_key` retorna `****` se não configurada / mascarada se configurada
5. `PUT /api/config/ai` com `api_key="****"` → chave NÃO sobrescrita no banco
6. `PUT /api/config/ai` com nova api_key → chave atualizada
7. Acessar `#/config/nist` → formulário carregado com valores do banco
8. Alterar page_size e salvar → toast de sucesso, valor persiste ao recarregar
9. Acessar `#/config/ai` → toggle e campos carregados corretamente
10. Ativar toggle, preencher campos, salvar → persiste
11. Desativar toggle, salvar → `enabled=false` persiste
12. Tentar acessar como `reader` → 403 na API, redirecionamento no frontend
