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
## Dashboard TradeMap-Style Redesign
- [ ] Adicionar campo de moeda (BRL/USD/JPY) e saldo alocado à tabela venues
- [ ] Adicionar procedure de venues.getWithStats (saldo + métricas por venue)
- [ ] Redesenhar dashboard: banca total consolidada (estilo TradeMap)
- [ ] Card Live: sem depósito/saque, apenas bankroll definido pelo jogador
- [ ] Gráfico rosca: distribuição da banca por plataforma
- [ ] Bloco "Meu Desempenho": barras horizontais por plataforma (ROI/Win Rate)
- [ ] Painel "Minhas Plataformas": lista expansível estilo "Meus Ativos" do TradeMap
- [ ] Conversão automática USD/JPY para BRL no total consolidado

## Correções de Patrimônio e Gráfico Donut

- [ ] Corrigir lógica do patrimônio total no Dashboard (valor deve refletir saldos reais das plataformas convertidos para BRL)
- [ ] Substituir gráfico de distribuição por donut chart Live vs Online estilo TradeMap
- [ ] Garantir que o card "Banca Total" exiba o patrimônio real do usuário (saldo online + bankroll live)

## Correções Urgentes de Patrimônio

- [x] Corrigir botão "Definir" no card Poker Live (não salva o valor)
- [x] Corrigir edição de saldo nas plataformas online (botão Editar não funciona)
- [x] Adicionar estado vazio com CTA quando nenhum patrimônio foi cadastrado
- [x] Corrigir donut chart para mostrar Live vs Online com valores reais
- [x] Patrimônio total deve usar saldos reais das plataformas (não initialOnline fictício)

- [x] Criar fluxo de onboarding de banca para usuários existentes (modal/banner com CTA)
- [x] Onboarding: usuário define saldo atual por plataforma + bankroll live
- [x] Após definir banca: recalcular ROI, resultado e patrimônio total automaticamente

## Logos das Plataformas

- [x] Adicionar logo da X Poker (imagem fornecida pelo usuário)
- [x] Adicionar logo da KK Poker (imagem fornecida pelo usuário)
- [x] Aumentar tamanho do logo da Suprema Poker (está pequeno)
- [x] Aumentar tamanho do logo da WPT (está pequeno)

- [x] Banner de onboarding deve desaparecer automaticamente quando ao menos uma plataforma tiver saldo definido
- [x] Ordenar plataformas por valor de banca (maior para menor) no Dashboard e na página de Locais

## Priorização Inteligente de Sessões

- [x] Criar procedure getUserPreferences que analisa histórico de sessões e retorna preferências ordenadas (plataforma, tipo de jogo, buy-in, formato)
- [x] Reordenar automaticamente plataformas na criação de sessão com base no histórico do usuário
- [x] Reordenar automaticamente tipo de jogo (MTT, cash, SNG) com base na frequência de uso
- [x] Pré-preencher buy-in sugerido com base no buy-in mais frequente por plataforma
- [x] Pré-selecionar modo online/live com base no perfil predominante do usuário
- [x] Exibir "Últimas mesas usadas" como atalho rápido na adição de mesa

## Novo Fluxo de Sessão (Container + Mesas)

- [x] Criar tabela sessionTables no schema (mesas dentro de uma sessão)
- [x] Criar tabela activeSessions para sessões em andamento com timer
- [x] Criar procedures: startSession, endSession, addTable, updateTable, removeTable
- [x] Redesenhar página de Sessões: sessão ativa com timer, lista de mesas, botão adicionar mesa
- [x] Modalidade padrão = Online (a menos que histórico mostre preferência por Live)
- [x] Ao finalizar sessão: calcular resultado total, ROI, tempo, R$/hora automaticamente
- [x] Exibir resumo da sessão finalizada com breakdown por mesa
- [x] Permitir editar/remover mesas individualmente dentro da sessão
- [x] Remover campos manuais de duração, data e hora do formulário de nova sessão (tudo automático)

## Correções do Timer de Sessão

- [x] Timer deve ser crescente (00:00 → subindo) desde o clique em "Nova Sessão"
- [x] Ao finalizar: perguntar "Deseja adicionar mais alguma mesa?" antes de confirmar
- [x] Confirmação final: "Tem certeza que deseja finalizar a sessão?" antes de calcular

## Preservação de Dados

- [ ] Garantir que dados de sessões existentes dos jogadores não sejam perdidos em nenhuma atualização
- [ ] Todas as migrações de schema devem ser aditivas (nunca DROP ou ALTER destrutivo)

## Migração de Dados de Usuários Antigos

- [ ] Criar script de migração que lê sessões antigas e reconstrói resultado acumulado por usuário
- [ ] Calcular banca atual = banca inicial + depósitos - saques + resultado das sessões
- [ ] Migrar bankrollSettings antigo (initialOnline/initialLive) para o novo modelo de saldo por plataforma
- [ ] Garantir que nenhum dado de sessão, fundo ou bankroll seja apagado

## Migração de Saldo Legado

- [x] Criar procedure bankroll.getLegacyMigrationStatus para detectar usuários com initialOnline > 0 e sem saldo em nenhuma plataforma
- [x] Criar banner/modal no Dashboard para usuários legados alocarem saldo por plataforma
- [x] Após alocação: zerar initialOnline e marcar migração como concluída

## Correção de Patrimônio Legado

- [x] Patrimônio total deve exibir initialOnline + resultado das sessões quando usuário ainda não associou saldo a plataformas
- [x] Adicionar indicador visual no Dashboard quando patrimônio é calculado pelo método legado (sem plataforma associada)

## Cotação de Moedas — Correção Urgente

- [x] AwesomeAPI retorna 429 (quota excedida) causando fallback fixo de R$ 5,75
- [x] Substituir por API sem quota (open.er-api.com + frankfurter.dev como fallback)
- [x] Reduzir cache de 24h para 1h para garantir cotação mais atual
- [ ] Exibir data/hora da última atualização da cotação no Dashboard

## Gráficos — Escala Dinâmica

- [x] Eixo Y dos gráficos deve se adaptar ao bankroll real do usuário (não ficar na casa de milhão se o saldo é baixo)
- [x] Gráfico de área de evolução: domínio Y baseado nos valores mínimo e máximo dos dados reais
- [ ] Gráfico de barras de desempenho: escala proporcional ao maior valor presente

## Gráfico de Pizza — Correção

- [x] Gráfico de pizza deve mostrar cada plataforma individualmente (não só Online vs Live)
- [x] Cada plataforma deve ter sua própria cor (mesmas cores do VENUE_COLORS)
- [x] Saldo Live deve entrar no gráfico de pizza corretamente
- [x] Legenda do gráfico deve listar cada plataforma com nome e valor

## Saldo Live — Atalho no Dashboard

- [x] Adicionar botão "Definir saldo" na seção Live do Dashboard (card de patrimônio)
- [x] Modal inline para editar initialLive sem sair do Dashboard
- [x] Após salvar, invalidar a query getConsolidated para atualizar o gráfico imediatamente

## Plataformas — Ajustes Visuais

- [x] Remover Stars Club Poker Room da lista de plataformas padrão
- [x] Remover Players Poker Club da lista de plataformas padrão
- [x] Aumentar logo da Suprema para caber no campo completo (object-cover)
- [x] Aumentar logo da WPT para caber no campo completo (object-cover)
- [x] Remover clubes Live da seção Minhas Plataformas do Dashboard (manter só online)
- [x] Remover clubes Live dos presets permanentemente (H2 Club, Monte Carlo)
- [ ] Exibir o bankroll Live como card separado na tela inicial
- [x] Mover seletor de cor de acento para o DashboardLayout (acessível em todas as abas)
- [x] Formatação do eixo Y deve usar a mesma função formatCurrencyCompact para exibir valores legíveis
