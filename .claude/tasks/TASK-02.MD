# TASK-02 — Autenticação e Usuários

## Objetivo
Implementar o sistema de autenticação JWT via cookie httpOnly, os middlewares de auth e autorização
por role, e o script CLI de criação de usuários.

## Referências da spec
- Seção 4.1 — Tabela `users`
- Seção 5 — Autenticação e Sessão (completo)
- Seção 8 — Segurança (bcrypt, JWT, rate limiting)
- Seção 9.4 — Script `create-user.js`

## Dependências
- TASK-01 concluída (banco criado, servidor rodando)

## Entregáveis

### `scripts/create-user.js`
Script CLI interativo para criação de usuários. Único mecanismo de criação fora da interface web.

**Fluxo:**
```
Nome de exibição: Eduardo Gadotti
Usuário (login): eduardo
Papel [reader/editor]: editor
Senha: ********
Confirmar senha: ********

Usuário 'eduardo' criado com sucesso (papel: editor).
```

**Regras de validação:**
- Senha e confirmação devem coincidir
- `username` deve ser único — exibir erro amigável se já existir
- `role` aceita apenas `reader` ou `editor`
- Senha armazenada com `bcrypt` (salt rounds = 12)
- Requer banco já inicializado; exibe erro claro caso contrário

### `src/repositories/userRepository.js`
Funções puras que recebem a instância `db` como parâmetro (injeção de dependência):
- `findByUsername(db, username)` → usuário ou undefined
- `findById(db, id)` → usuário ou undefined
- `create(db, { name, username, passwordHash, role })` → id do novo usuário

### `src/services/authService.js`
- `login(db, username, password)` → JWT assinado ou lança erro
  - Busca usuário por username
  - Compara senha com bcrypt
  - Gera JWT com payload `{ userId, username, role }`, `HS256`, validade 30 dias
- `verifyToken(token)` → payload decodificado ou lança erro

### `src/middleware/authenticate.js`
- Lê o JWT do cookie `token`
- Verifica e decodifica com `authService.verifyToken`
- Injeta `req.user = { id, username, role }` no request
- Retorna `401` se cookie ausente ou token inválido

### `src/middleware/authorize.js`
- Fábrica: `authorize('editor')` → middleware que verifica `req.user.role`
- Retorna `403` se role insuficiente
- `reader` tem acesso somente leitura; `editor` tem acesso total

### `src/api/authRoutes.js`
Montar as rotas de autenticação no Express:

| Método | Rota | Autenticado | Descrição |
|---|---|---|---|
| `POST` | `/api/auth/login` | Não | Valida credenciais; seta cookie JWT |
| `POST` | `/api/auth/logout` | Sim | Limpa cookie; resposta 200 idempotente |
| `GET` | `/api/auth/me` | Sim | Retorna `{ id, name, username, role }` |

**`POST /api/auth/login`:**
- Body: `{ username, password }`
- Sucesso: seta cookie `token` com flags `httpOnly; SameSite=Strict`; retorna `{ user: { id, name, username, role } }`
- Flag `Secure` adicionada apenas se `NODE_ENV=production`
- Rate limiting: máximo 10 tentativas por IP em janela de 15 minutos
- Falha: `401` com mensagem genérica (não especifica se usuário ou senha está errado)

**`POST /api/auth/logout`:**
- Limpa o cookie `token` (maxAge=0)
- Sempre retorna `200`

**`GET /api/auth/me`:**
- Requer autenticação
- Retorna dados do usuário a partir do payload do JWT (sem consultar o banco)

### Integração em `src/server.js`
- Aplicar `authenticate` em todas as rotas `/api/*` exceto `POST /api/auth/login` e `GET /api/health`
- Montar `authRoutes` em `/api/auth`

## Como validar

1. `npm run create-user` — criar um usuário `editor` (ex: admin/admin123)
2. `npm run create-user` — tentar criar com o mesmo username → deve exibir erro
3. `npm run create-user` — tentar role inválida (`superuser`) → deve exibir erro
4. `POST /api/auth/login` com credenciais corretas → resposta 200, cookie `token` setado
5. `POST /api/auth/login` com senha errada → resposta 401
6. `GET /api/auth/me` com cookie válido → retorna dados do usuário
7. `GET /api/auth/me` sem cookie → resposta 401
8. `GET /api/assets` sem cookie → resposta 401 (confirma que middleware está ativo)
9. `POST /api/auth/logout` → resposta 200, cookie removido
10. `GET /api/auth/me` após logout → resposta 401
11. Testar rate limiting: 11 tentativas de login com senha errada → 11ª deve retornar 429
