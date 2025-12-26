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
