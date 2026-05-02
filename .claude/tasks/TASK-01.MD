# TASK-01 — Fundação do Projeto

## Objetivo
Criar a estrutura base do projeto: diretórios, dependências, servidor Express funcional,
sistema de migrations e banco de dados com todas as tabelas criadas e WAL mode ativo.

## Referências da spec
- Seção 2 — Requisitos Não Funcionais
- Seção 3.2 — Estrutura de Diretórios
- Seção 4 — Modelo de Dados (todas as tabelas)
- Seção 9.1 — Variáveis de Ambiente
- Seção 9.2 — Scripts npm
- Seção 9.3 — Migrations e Pragmas SQLite

## Dependências
Nenhuma — esta é a task inicial.

## Entregáveis

### Estrutura de diretórios
```
shadowradar/
├── src/
│   ├── api/
│   ├── services/
│   ├── repositories/
│   ├── integrations/
│   ├── middleware/
│   ├── models/
│   ├── db/
│   │   ├── migrate.js       # Runner de migrations
│   │   ├── connection.js    # Abre conexão com WAL mode e pragmas
│   │   └── migrations/
│   │       └── 001_initial_schema.js
│   └── server.js
├── public/
│   ├── index.html           # Placeholder mínimo
│   ├── css/
│   └── js/
├── scripts/
├── data/
├── tests/
├── .env.example
├── .gitignore
└── package.json
```

### `package.json`
Dependências de produção:
- `express`
- `better-sqlite3`
- `bcrypt`
- `jsonwebtoken`
- `cookie-parser`
- `helmet`
- `joi`

Scripts npm conforme spec:
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

### `src/db/connection.js`
- Abre o banco no caminho definido por `DB_PATH` (env var)
- Aplica os pragmas na abertura:
  ```sql
  PRAGMA journal_mode=WAL;
  PRAGMA synchronous=NORMAL;
  PRAGMA foreign_keys=ON;
  ```
- Exporta a instância única (singleton) para uso em toda a aplicação

### `src/db/migrations/001_initial_schema.js`
Criar todas as 5 tabelas conforme spec seção 4:

**`users`**
- id, name, username (UNIQUE), password_hash, role ('reader'|'editor'), created_at

**`assets`**
- id, name, tag (NULL), description, url, current_version, active (default 1), cve_start_date, created_at, updated_at
- UNIQUE constraint parcial: quando tag não é NULL, o par (name, tag) deve ser único

**`asset_cves`**
- id, asset_id (FK → assets.id CASCADE DELETE), cve_id, description, severity, cvss_score, published_at, user_assessment (NULL), user_notes, ai_assessment (NULL), scanned_at, evaluated_at

**`scan_runs`**
- id, started_at, finished_at (NULL), status, assets_scanned, cves_found, error_message (NULL)

**`config`**
- key (PK), value, updated_at

**`_migrations`**
- id, name, applied_at

### `src/db/migrate.js`
- Runner que lê os arquivos em `db/migrations/` em ordem
- Registra cada migration aplicada na tabela `_migrations`
- Idempotente: não re-executa migrations já aplicadas
- Executado automaticamente ao iniciar o servidor (importado em `server.js`)

### `src/db/seed.js`
Inserir dados de teste para desenvolvimento:
- 1 usuário `editor` (username: `admin`, senha: `admin123`)
- 1 usuário `reader` (username: `viewer`, senha: `viewer123`)
- 3 ativos de exemplo com versões diferentes
- Valores padrão na tabela `config` (nist.page_size=50, ai.enabled=false, scan.script_path=./scripts/scan.py)

### `src/server.js`
- Carrega variáveis de ambiente (`.env`)
- Executa migrations antes de iniciar
- Configura middleware: `helmet`, `cookie-parser`, `express.json()`, CORS
- Serve `public/` como arquivos estáticos
- Rota de health check: `GET /api/health` → `{ status: 'ok', version: '...' }`
- Inicia na porta definida por `PORT` (padrão: 3000)

### `.env.example`
```
PORT=3000
NODE_ENV=development
DB_PATH=./data/shadowradar.db
JWT_SECRET=troque-por-string-aleatoria-de-alta-entropia
LOG_LEVEL=info
```

### `.gitignore`
```
node_modules/
data/
.env
```

## Como validar

1. `npm install` — sem erros
2. Copiar `.env.example` para `.env` e ajustar
3. `npm run db:migrate` — deve criar o arquivo `data/shadowradar.db` e exibir as migrations aplicadas
4. `npm run db:seed` — deve inserir os dados de teste sem erros
5. `npm start` — servidor sobe na porta 3000
6. `GET http://localhost:3000/api/health` → retorna `{ "status": "ok" }`
7. Executar `npm run db:migrate` uma segunda vez — não deve reexecutar nada (idempotência)
8. Verificar com um cliente SQLite que as 5 tabelas existem e os pragmas estão ativos:
   `PRAGMA journal_mode;` → deve retornar `wal`
