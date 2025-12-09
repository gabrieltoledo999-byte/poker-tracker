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
