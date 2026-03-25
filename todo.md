# Poker Tracker - TODO

## Funcionalidades Core

- [x] Schema do banco de dados (tabela sessions)
- [x] Queries de banco de dados (CRUD sessões, estatísticas)
- [x] Rotas tRPC (sessões, estatísticas, bankroll)
- [x] Gestão de bankroll separado (R$ 1.000 online / R$ 4.000 live)
- [x] Registro de sessões (buy-in, cash-out, tipo, data, duração, notas)
- [x] Cálculo automático de métricas (ROI, lucro, hourly rate)
- [x] Dashboard com estatísticas gerais
- [x] Gráfico de evolução do bankroll
- [x] Filtros por tipo, período e ordenação
- [x] Lista de sessões com cards
- [x] Editar/excluir sessões

## Design

- [x] Tema escuro com cores de poker (verde, dourado, preto)
- [x] Ícones temáticos de poker
- [x] Indicadores visuais de resultado (verde/vermelho)

## Tipos de Jogo (Nova Feature)

- [x] Adicionar campo gameFormat ao schema (Torneio, Cash Game, Sit & Go, etc.)
- [x] Atualizar rotas tRPC para filtrar por gameFormat
- [x] Adicionar estatísticas por tipo de jogo no dashboard
- [x] Atualizar formulário de sessão com seleção de tipo de jogo
- [x] Adicionar filtro por tipo de jogo na lista de sessões

## Locais/Plataformas (Nova Feature)

- [x] Criar tabela de locais no schema (nome, tipo online/live, notas)
- [x] Criar rotas tRPC para CRUD de locais
- [x] Atualizar sessões para referenciar local cadastrado
- [x] Criar página de gerenciamento de locais
- [x] Adicionar seleção de local no formulário de sessão
- [x] Adicionar estatísticas por local no dashboard

## Conversão de Moeda (Nova Feature)

- [x] Buscar cotação USD/BRL em tempo real
- [x] Adicionar campo de moeda no formulário de sessão (USD/BRL)
- [x] Converter automaticamente valores USD para BRL ao salvar
- [x] Mostrar valor original e convertido na lista de sessões

## Perfil e Convites (Nova Feature)

- [x] Adicionar campo avatarUrl à tabela de usuários
- [x] Criar tabela de convites (inviterId, inviteeId, code, status)
- [x] Criar rotas tRPC para gerar e aceitar convites
- [x] Criar rota para ranking de usuários por convites
- [x] Exibir foto de perfil do usuário no layout
- [x] Criar página de convites com formulário para enviar
- [x] Exibir ranking de usuários com mais convites aceitos

## Correções

- [x] Adicionar opção para usuário incluir foto de perfil manualmente nas configurações

- [x] Adicionar upload de foto de perfil via drag & drop (salvar no S3)

## Melhorias de UX/Intuitividade

- [x] Adicionar botão de ação rápida "Nova Sessão" no Dashboard
- [x] Melhorar feedback visual com estados de loading e empty states
- [x] Adicionar tooltips explicativos nos campos e métricas
- [x] Adicionar confirmação visual ao salvar (animações sutis)

## Gráficos Separados

- [x] Separar gráficos de evolução do bankroll em três seções: Online, Live e Geral

## Gerenciamento de Fundos (Nova Feature)

- [x] Criar tabela de transações de fundos (depósitos/saques)
- [x] Criar rotas tRPC para CRUD de transações de fundos
- [x] Permitir edição dos valores iniciais do bankroll (online/live)
- [x] Criar página de gerenciamento de fundos
- [x] Atualizar cálculo do bankroll para incluir transações externas

## Melhorias de Navegação e Dúvidas (Nova Feature)

- [ ] Criar tabela de dúvidas/anotações vinculadas às sessões
- [ ] Adicionar campo de dúvidas no formulário de sessão
- [ ] Exibir dúvidas na lista de sessões e detalhes
- [ ] Melhorar navegação com breadcrumbs e indicadores visuais
- [ ] Adicionar atalhos rápidos e fluxos mais claros

## Navegação no Topo e Correção de Duração

- [x] Criar navegação horizontal no topo (substituir sidebar)
- [x] Corrigir campo de duração para aceitar horas e minutos separados (sem limite de 60min)
- [x] Adicionar sistema de dúvidas/anotações nas sessões

## Edição de Bankroll e Importação por Nickname

- [ ] Tornar bankroll Online/Live editável diretamente no dashboard (inline edit)
- [ ] Pesquisar APIs de poker para importação automática por nickname
- [ ] Implementar importação de sessões por nickname (se API disponível)

## Integração Sharkscope

- [ ] Criar rota backend para buscar torneios do Sharkscope por nickname/rede
- [ ] Criar página de importação Sharkscope com campo de nickname e rede
- [ ] Converter torneios do Sharkscope em sessões no tracker
- [ ] Exibir prévia dos torneios antes de importar
- [x] Edição inline do bankroll no dashboard

## Sharkscope e Correções

- [x] Corrigir erro de importação duplicada de trpc no Dashboard
- [x] Adicionar widget de acesso rápido ao Sharkscope (busca por nickname/rede)
- [x] Edição inline do bankroll no dashboard

## Simplificação do Bankroll

- [x] Zerar valor inicial do bankroll (começar do zero)
- [x] Criar botões simples de Depositar/Sacar nos cards do dashboard
- [x] Remover complexidade de "valor inicial" — só mostrar saldo atual

## Favicon

- [x] Corrigir favicon para aparecer no Google Chrome (usar CDN externo)

## Feed e Imagens

- [x] Corrigir exibição de imagens no Feed para não cortar (object-fit: contain)

## Notificações e Privacidade

- [ ] Badge de notificação no ícone do Feed (contador de posts não lidos)
- [ ] Notificação de curtidas e comentários nos posts do usuário
- [ ] Ranking: pedir autorização ao jogador (ranking geral / só amigos / não participar)

## Clubes e Plataformas

- [ ] Adicionar Suprema Poker e PPPoker como opções de plataforma/local

## Sessões — Melhorias

- [ ] Permitir abrir sessão sem preencher horas e ganhos (preencher depois ao encerrar)
- [ ] Suporte a múltiplas mesas por sessão (até 20 mesas simultâneas)
- [ ] Torneio Online deve aparecer antes de Live no formulário de nova sessão
- [ ] Sistema de memória: sugerir o tipo de torneio mais jogado ao criar nova sessão
- [ ] Freeroll: buy-in = R$ 0,00 automático ao selecionar freeroll
- [ ] Corrigir data no formulário de nova sessão (não atualiza automaticamente após a primeira)

## Moedas e Conversão

- [ ] Cotação do dólar atualizada automaticamente com base no dia atual
- [ ] Conversão automática de saldo em USD para BRL no bankroll (ex: US$ 10 no PokerStars → converte para o total do site)
- [ ] Adicionar Iene japonês (JPY) como opção de moeda (para GGPoker e WPT)

## Amigos e Social

- [ ] Adicionar amigo pelo nickname no Ranking, Feed e Convites

## Filtros e Visualização

- [ ] Corrigir ordenação do filtro de sessões (não aparecem em ordem correta)
- [ ] Mostrar torneios jogados no dia com lucro/prejuízo (resumo diário)

## Segurança

- [ ] Confirmar se o sistema de login e senha está implementado corretamente

## Rebrand para The Rail

- [ ] Atualizar nome do app para "The Rail" em todo o projeto
- [ ] Aplicar nova paleta de cores: fundo azul-escuro, roxo, ciano neon
- [ ] Atualizar logo no header com a imagem do The Rail
- [ ] Atualizar favicon para o logo do The Rail
- [ ] Atualizar meta tags Open Graph com novo nome e logo

## Lista de Grind

- [ ] Criar tabela de torneios favoritos (grind list) no schema
- [ ] Criar procedures CRUD para lista de grind
- [ ] Criar página de Lista de Grind
- [ ] Integrar lista de grind ao formulário de nova sessão (seleção rápida)

## Avatares Pré-definidos

- [ ] Adicionar galeria de avatares pré-definidos na página de perfil/configurações
