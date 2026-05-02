# TASK-05 — Página de Ativos (Frontend)

## Objetivo
Implementar a página de gerenciamento de ativos: listagem com busca e paginação,
modal de criação/edição e ações de ativar/desativar e excluir.

## Referências da spec
- Seção 6.2 — Cadastro de Ativos (campos, regras, listagem)

## Dependências
- TASK-03 (API de ativos funcionando)
- TASK-04 (shell do frontend e design system)

## Entregáveis

### `public/js/pages/assets.js`
Módulo ES com função `render(container, currentUser)`.

#### Listagem

**Tabela com colunas:**
- Nome
- Tag
- Descrição
- Versão Atual
- Status (badge Ativo / Inativo)
- Último Scan (formatado: `DD/MM/YYYY HH:mm` ou `—` se nunca escaneado)
- Total CVEs (número ou `0`)
- Ações

**Ações por linha:**
- `editor`: Editar (abre modal), Ativar/Desativar (toggle), Excluir (com confirmação)
- `reader`: somente visualização, sem coluna de ações

**Busca e filtros (acima da tabela):**
- Campo de texto: busca por nome, tag ou descrição (debounce de 300ms)
- Filtro de status: Select — Todos / Ativos / Inativos

**Paginação (abaixo da tabela):**
- Controles: Anterior / Próximo / números de página
- Exibir: "Mostrando X–Y de Z ativos"
- Padrão: 20 registros por página

**Estados a tratar:**
- Loading: skeleton de tabela enquanto carrega
- Vazio: mensagem "Nenhum ativo cadastrado" com botão de criar (se editor)
- Erro de rede: mensagem com botão de tentar novamente

#### Modal de Criação / Edição

**Campos do formulário:**

| Campo | Tipo | Obrigatório |
|---|---|---|
| Nome | `<input type="text">` | Sim |
| Tag | `<input type="text">` | Não |
| Descrição | `<textarea>` | Não |
| URL | `<input type="url">` | Não |
| Versão Atual | `<input type="text">` | Sim |
| Data Inicial CVEs | `<input type="date">` | Sim |
| Ativo | Toggle (checkbox estilizado) | Sim |

**Comportamento do modal:**
- Título: "Novo Ativo" (criação) ou "Editar Ativo" (edição)
- Na edição: campos pré-preenchidos com os dados atuais
- Validação client-side antes de submeter:
  - Campos obrigatórios preenchidos
  - Data Inicial CVEs não pode ser futura
- Submete para `POST /api/assets` ou `PUT /api/assets/:id`
- Exibir erro de API inline no modal (ex: duplicata de name+tag → exibe `409`)
- Sucesso: fecha modal e recarrega a listagem

#### Ação de Exclusão
- Confirmação via `window.confirm` ou modal de confirmação simples
- Texto: "Excluir [Nome do ativo]? Todos os CVEs associados serão removidos."
- Confirma: `DELETE /api/assets/:id` → recarrega lista
- Ação de Ativar/Desativar: `PATCH /api/assets/:id/toggle` → atualiza linha sem reload completo

## Como validar

1. Acessar `#/assets` como `editor`
2. Tabela carrega com dados do seed
3. Buscar por nome → filtra em tempo real (debounce)
4. Filtrar por Ativos → mostra somente registros com active=1
5. Clicar em "Novo Ativo" → modal abre
6. Preencher formulário incompleto → validação client-side impede envio
7. Preencher formulário válido → ativo criado, aparece na lista
8. Tentar criar com name+tag duplicado → erro exibido no modal
9. Editar um ativo → modal pré-preenchido, salvar atualiza lista
10. Ativar/Desativar → badge de status muda sem reload completo
11. Excluir → confirmação, ativo removido da lista
12. Paginação: criar mais de 20 ativos e navegar entre páginas
13. Acessar `#/assets` como `reader` → sem botões de ação, sem coluna Ações
14. Estado vazio: filtrar por algo inexistente → mensagem de empty state
