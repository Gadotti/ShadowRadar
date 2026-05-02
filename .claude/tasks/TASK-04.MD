# TASK-04 — Shell do Frontend e Página de Login

## Objetivo
Criar a estrutura base do frontend: HTML, design system CSS, roteamento hash-based,
wrapper de fetch, menu lateral colapsável e página de login funcional.

## Referências da spec
- Seção 2 — Frontend Vanilla JS, sem framework/bundler
- Seção 3.2 — Estrutura de diretórios `public/`
- Seção 3.3 — Roteamento hash-based
- Seção 6.1 — Menu Lateral
- Seção 2 — Interface clean e minimalista

## Dependências
- TASK-02 (endpoint de login funcionando)

## Entregáveis

### `public/index.html`
Estrutura HTML base que serve como shell para toda a aplicação:
- `<head>` com meta charset, viewport, link para `styles.css`
- Container do menu lateral (`<aside id="sidebar">`)
- Container de conteúdo principal (`<main id="content">`)
- `<script type="module" src="js/app.js">` no final do body
- Nenhum conteúdo de página embutido — tudo renderizado via JS

### `public/css/styles.css`
Design system completo para toda a aplicação. Deve contemplar:

**Tokens CSS (custom properties):**
```css
--color-bg: fundo principal
--color-surface: cards, painéis
--color-border: bordas sutis
--color-text: texto principal
--color-text-muted: texto secundário
--color-primary: cor de ação primária
--color-danger: erros, exclusão
--color-warning: alertas
--color-success: confirmações
--sidebar-width-expanded: 220px
--sidebar-width-collapsed: 56px
```

**Componentes base a definir:**
- Layout: sidebar + conteúdo, transição de expansão/colapso
- Tipografia: escala de tamanhos, pesos
- Botões: primário, secundário, perigo, ghost
- Inputs: texto, select, textarea, toggle, date picker
- Tabelas: cabeçalho, linhas, hover, paginação
- Cards / KPI cards
- Badges de severidade (CRITICAL=vermelho, HIGH=laranja, MEDIUM=amarelo, LOW=azul, NONE=cinza)
- Badges de avaliação de usuário
- Modal overlay
- Indicadores de loading / skeleton
- Mensagens de erro e sucesso (toast ou inline)
- Estado vazio (empty state)

### `public/js/api.js`
Wrapper centralizado para todas as chamadas HTTP. Módulo ES (`export`).

**Comportamento:**
- `baseUrl` = `/api`
- Inclui `credentials: 'include'` em todas as requisições (necessário para enviar cookie)
- Intercepta respostas `401`: redireciona para `#/login`
- Intercepta respostas `403`: exibe mensagem de acesso negado
- Funções exportadas: `get(path, params)`, `post(path, body)`, `put(path, body)`, `patch(path, body)`, `del(path)`
- Serializa query params automaticamente em `get()`
- Retorna o body JSON parseado; lança erro com `{ status, message }` em caso de falha

### `public/js/app.js`
Entry point do frontend. Responsável pelo roteamento e ciclo de vida das páginas.

**Responsabilidades:**
- Importa e inicializa o componente `sidebar`
- Escuta `window.hashchange` e `DOMContentLoaded`
- Mapeia rotas para módulos de página:
  ```js
  const routes = {
    '/login':       () => import('./pages/login.js'),
    '/dashboard':   () => import('./pages/dashboard.js'),
    '/assets':      () => import('./pages/assets.js'),
    '/results':     () => import('./pages/results.js'),
    '/scan':        () => import('./pages/scan.js'),
    '/config/nist': () => import('./pages/configNist.js'),
    '/config/ai':   () => import('./pages/configAi.js'),
  }
  ```
- Se rota não existe → redireciona para `#/dashboard`
- Antes de renderizar qualquer rota exceto `/login`: verifica se há usuário autenticado (chama `GET /api/auth/me`); se não → redireciona para `#/login`
- Rotas restritas a `editor` (`/scan`, `/config/nist`, `/config/ai`): se `role !== 'editor'` → redireciona para `#/dashboard`
- Armazena `currentUser` em variável de módulo (não em localStorage)
- Renderiza a página importada chamando `render(container, currentUser)`

### `public/js/components/sidebar.js`
Componente do menu lateral. Módulo ES.

**HTML gerado:**
- Lista de itens de menu com ícone + rótulo
- Itens de configuração/scan renderizados somente se `user.role === 'editor'`
- Botão de colapso/expansão
- Rodapé com versão e botão logout

**Comportamento:**
- Estado `collapsed` lido/escrito no `localStorage` (chave: `sidebar_collapsed`)
- Ao colapsar: apenas ícones visíveis; CSS transition suave
- Tooltip com o nome ao hover sobre ícone colapsado
- Item ativo destacado conforme rota atual (`window.location.hash`)
- Botão logout: chama `POST /api/auth/logout` e redireciona para `#/login`
- Versão lida de `GET /api/health` (campo `version`)

**Ícones:** usar SVG inline simples ou caracteres Unicode — sem dependência de iconlib externa.

### `public/js/pages/login.js`
Página de login. Módulo ES com função `render(container)`.

**Formulário:**
- Campo `username` (texto)
- Campo `password` (password)
- Botão "Entrar"
- Mensagem de erro inline para credenciais inválidas

**Comportamento:**
- Submit chama `POST /api/auth/login`
- Sucesso: armazena user retornado e redireciona para `#/dashboard`
- Falha: exibe mensagem de erro sem revelar se foi usuário ou senha
- Se usuário já autenticado ao acessar `/login` → redireciona para `#/dashboard`

### `public/vendor/chart.js`
Baixar o arquivo de build do Chart.js (versão estável) e salvar localmente.
Não carregar de CDN externo — `Content-Security-Policy` não permite em produção.

## Como validar

1. `npm start` e abrir `http://localhost:3000` no navegador
2. Deve redirecionar automaticamente para `#/login`
3. Login com credenciais erradas → mensagem de erro inline
4. Login com credenciais corretas → redireciona para `#/dashboard`
5. Menu lateral visível com itens corretos para o role do usuário
6. Itens Scan e Config visíveis apenas para `editor`, ocultos para `reader`
7. Clicar em colapsar → menu reduz mostrando só ícones; estado persiste após reload
8. Hover sobre ícone colapsado → tooltip com o nome
9. Item ativo destacado conforme a página atual
10. Logout → cookie removido, redireciona para `#/login`
11. Tentar acessar `#/scan` com usuário `reader` → redireciona para `#/dashboard`
12. Tentar acessar `#/dashboard` sem autenticação → redireciona para `#/login`
13. Navegar entre rotas sem reload da página
14. Inspecionar: nenhum request falha por CORS ou CSP
