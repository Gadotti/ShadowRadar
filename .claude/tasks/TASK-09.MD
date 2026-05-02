# TASK-09 — Página de Resultados / CVEs (Frontend)

## Objetivo
Implementar a página de resultados com visão lista e visão macro, filtros, ordenação,
painel de detalhes do CVE e modal de edição de avaliação.

## Referências da spec
- Seção 6.6 — Tela de Resultados / CVEs (completo)

## Dependências
- TASK-08 (endpoints de CVEs)
- TASK-04 (shell do frontend e design system)

## Entregáveis

### `public/js/pages/results.js`
Módulo ES com função `render(container, currentUser)`.

#### Cabeçalho da Página

- **Indicador de último scan:** exibe data/hora do último scan concluído
  - Verde: scan realizado nos últimos 7 dias
  - Amarelo: scan há mais de 7 dias
  - Cinza/alerta: nunca escaneado
- **Toggle de visão:** botões "Lista" / "Macro" — persiste em `localStorage` (chave: `results_view`)

#### Painel de Filtros

Filtros aplicados às duas visões:

| Filtro | Tipo | Valores |
|---|---|---|
| Busca | Texto (debounce 300ms) | CVE ID ou descrição |
| Ativo | Multi-select | Lista de ativos carregada da API |
| Severidade | Multi-select | CRITICAL / HIGH / MEDIUM / LOW / NONE |
| Avaliação Usuário | Multi-select | Acknowledge/Mitigating / Accepted Risk / Not Affected / False Positive / Pending |
| Avaliação IA | Select | Todos / Com avaliação / Sem avaliação |
| Publicação | Date range | De / Até |
| Ativos | Toggle | Ativos / Inativos / Todos |

- Botão "Limpar filtros"
- Filtros persistem ao alternar entre visão lista e macro

---

#### Visão Lista

Tabela paginada (padrão 50/página) com cabeçalhos clicáveis para ordenação:

| Coluna | Ordenável |
|---|---|
| CVE ID | Sim |
| Ativo (nome + tag + versão) | Sim |
| Descrição (truncada, expandível) | Não |
| Severidade (badge colorido) | Sim |
| CVSS Score | Sim |
| Data Publicação | Sim |
| Avaliação Usuário (badge ou "Pending") | Sim |
| Avaliação IA (ícone: preenchido / vazio) | Não |
| Ações | Não |

**Ações por linha:**
- Ícone de detalhes → abre painel lateral de detalhes
- Ícone de editar avaliação → abre modal de avaliação (somente `editor`)
- Ícone de reprocessar IA → força reenvio ao Claude (somente `editor`)

**Paginação:** controles inferiores com "Anterior / Próximo / X de Y páginas"

---

#### Visão Macro

Tabela agrupada por ativo, sem paginação (todos os ativos visíveis):

| Coluna | Descrição |
|---|---|
| Ativo | Nome + Tag + Versão |
| Total | Contagem total de CVEs |
| Crítico | Badge com contagem |
| Alto | Badge com contagem |
| Médio | Badge com contagem |
| Baixo | Badge com contagem |
| Pendentes | CVEs sem avaliação |
| Risco Geral | Badge colorido com nível |
| Alerta | Texto da mensagem de alerta |
| Último Scan | Data formatada |

**Regras visuais dos badges de risco:**
- CRITICAL → fundo vermelho escuro
- HIGH → fundo laranja
- MEDIUM → fundo amarelo
- LOW → fundo azul
- NONE → fundo cinza

---

#### Painel Lateral de Detalhes do CVE

Painel deslizante (slide-in) da direita ao clicar em um CVE:

**Conteúdo:**
- CVE ID com link externo para `https://nvd.nist.gov/vuln/detail/{cve_id}`
- Ativo: nome + tag + versão
- Severidade NIST + CVSS Score
- Data de publicação
- Descrição completa (sem truncamento)
- Avaliação do usuário + notas (se preenchidas)
- Avaliação IA (texto completo; área de texto somente leitura)
- Data do último scan
- Data da última avaliação

---

#### Modal de Edição de Avaliação

Abre ao clicar em editar (somente `editor`):

**Campos:**
- Select: `Acknowledge/Mitigating` / `Accepted Risk` / `Not Affected` / `False Positive` / `— (sem avaliação)`
- Textarea: Observações do analista

**Comportamento:**
- Pré-preenchido com valores atuais do CVE
- Salva via `PUT /api/cves/:id/assessment`
- Sucesso: atualiza linha na tabela sem reload completo; fecha modal

---

### Estados globais da página
- Loading: skeleton de tabela
- Vazio: "Nenhum CVE encontrado com os filtros aplicados"
- Erro: mensagem com botão de tentar novamente

## Como validar

1. Acessar `#/results` → indicador de último scan exibido
2. CVEs carregados na visão lista com badges de severidade corretos
3. Clicar em coluna ordenável → lista reordenada; seta indica direção
4. Filtrar por severidade CRITICAL → somente CVEs CRITICAL
5. Filtrar por avaliação "Pending" → somente CVEs sem `user_assessment`
6. Buscar por texto → filtra por CVE ID e descrição
7. Data range → filtra por `published_at`
8. Limpar filtros → todos os CVEs voltam
9. Clicar em CVE → painel lateral abre com dados completos
10. Link do CVE ID → abre nvd.nist.gov na nova aba
11. Clicar em editar (editor) → modal com campos pré-preenchidos
12. Salvar avaliação → badge na tabela atualiza sem reload
13. Limpar avaliação (selecionar "sem avaliação") → badge volta para "Pending"
14. Alternar para visão macro → agrupamento por ativo com contagens corretas
15. Ativo com todos CVEs "Not Affected" → risk = NONE, alert correto
16. Alternar entre lista e macro → filtros mantidos
17. Acessar como `reader` → sem ícones de editar e reprocessar IA
18. Paginação na visão lista → navegar entre páginas
