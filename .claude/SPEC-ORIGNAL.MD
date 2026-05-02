# Intrução e necessidade
O sistema ShadowRadar deve ser um sistema web para controlar External Security Posture Management cadastrando ativos, geralmente web ou SaaS, que não são possíveis de se mapear automaticametne no ambiente de uma empresa ou que tampouco podem fazer parte da rede para serem mapeados.

O monitoramento destes ativos e suas versões são gerenciados pelo ShadowRadar, consultado a base de CVEs e analisando se a versão corrente está vulnerável ou não, sendo esta análise a ser realizada manualmente ou opcionalmente com auxílio de uma IA por API.

# Requisitos não funcionais
- Base de dados SQLite
- Desenvolvido em Node.js
- Interface clean e minimalista
- Arquitetura deve ser testável através de testes unitários
- Codificação deve se basear nos princípios SOLID e definições estabelecidas no arquivo `CODE-STANDARDS.MD`

# Requisitos funcionais

## Controle de usuários e sessão
- Deve possui controle de autenticação por usuários logados.
- Sessão dos usuários deve ser controlado pelo localstorage do navegador e não será expirável
- Deve persistir a sessão do banco de dados para que ao reiniciar a aplicação o usuário não tenha que fazer login, mas o controle de autenticação deve ser pela sessão para que não haja problemas de latencia com I/O no banco.

## Página de configuração da fonte de CVE
- Deve possuir um tela de configuração da fonte de CVEs a ser utilizado
- O sistema irá dispor por padrão a API do NIST para utilização
- O programa deve estar preparado em versões futuras para outros tipos de fontes, pode enquanto somente a fonte do NIST poderá ser utilizada e tela será somente leitura e apresentada por enquanto para consulta de configuração apenas.
- A tela deverá permitir configuração de páginação, quantos CVEs por vez, a consulta à API do NIST. Por padrão o sistema utilizará 50 cves por página

## Página de configuração da integração com IA
- A integração com IA pode ou não ser utilizada, deve ser possível ativar ou inativar a configuração
- A configuração será compatível nesta primeira etapa somente com Claude
- Deve ser possível configurar a URL, max tokens (padrão 16000), temperature (padrão 0) e batch size (padrão 20) que é a quantidade de CVEs enviadas por requisição à API.

## Página de cadastro dos ativos
- Deve ser possível cadastrar os ativos que serão monitorados através de informações como Nome, Descrição, URL, Ativo/Inativo, Data de inicial da publicação dos CVEs e a versão corrente.
- Deve ser possível incluir 'N' ativos com mesmo nome, com descrição diferentes, visto que um ambiente pode ter mais de um mesmo ativo em diferentes máquinas ou servidores e que inclusive podem ter versões iguais ou diferentes.
- Deve existir uma tabela filha associada para armazenar os respectivos CVEs consultados e avaliados.

## Página com a listagem geral dos resultados
- Deve ser possível visualizar a listagem de CVEs obtidos para os ativos cadastrados
- A página deve permitir aplicação de filtros e ordenação dos campos disponíveis
- Cada item deve conter o ID do CVE (por exmeplo CVE-2026-25815), a descrição original obtida do CVE, severidade, data de publicação do CVE, avaliação atribuída pelo usuário e a avaliação da IA
- Deve ser possível configurar a visão por lista de CVEs ou macro por ativos com seus totais, risco e alerta
- Deve ter um inidicador geral da data do último scan realizado

## Página de dashboard
- Deve apresentar gráficos dos dados processados pela aplicação
- Deve possuir filtros por ativos, status ou riscos por exemplo (não limitado a apenas estes)

## Menu
- A navegação das páginas deve ser relizada por um menu lateral esquerdo, que pode ser expandido ou recolhido. 
- Na posição recolhida ficarão visíveis apenas os ícones das páginas
- Na parte de baixo deste menus deve estar visíveis a versão da aplicação e a função de logout.

## APIs
- Deve possuir uma API de exportação dos resultados para consumo em outras aplicações compatíveis
- Deve possuir uma API de importação ou atualização da listagem de ativos, para que outras aplicações compatíveis possam indicar a entrada novos ativos ou a atualização da versão de um ativo já existente.