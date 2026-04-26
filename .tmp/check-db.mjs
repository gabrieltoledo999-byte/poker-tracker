import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Check all tables and their row counts
const [tables] = await conn.query('SHOW TABLES');
const tableNames = tables.map(row => Object.values(row)[0]);
console.log('TABLES:', tableNames);

for (const table of tableNames) {
  const [rows] = await conn.query(`SELECT COUNT(*) as count FROM \`${table}\``);
  console.log(`${table}: ${rows[0].count} rows`);
}

await conn.end();
1. ERRO CRÍTICO — animação das fichas indo para o lugar errado
Problema atual

Quando o jogador aposta:

a ficha sai do jogador
vai direto para o centro da mesa
ignora o ponto intermediário (aposta do jogador)

Isso está errado.

Regra correta do pôquer (visual e lógica)

A ficha NUNCA vai direto para o pote.

Fluxo correto:
jogador aposta
fichas saem do jogador
fichas param na frente dele (área de aposta)
quando a rodada termina → tudo é puxado para o pote central
Correção obrigatória
Criar dois níveis de destino:
enum ChipDestination {
  PLAYER_BET_ZONE,
  CENTER_POT
}
Lógica correta da animação
Durante a street:
player -> PLAYER_BET_ZONE
Fim da street:
PLAYER_BET_ZONE -> CENTER_POT
BUG atual do dealer

As fichas estão:

indo para o centro direto
passando por cima do botão do dealer
Isso acontece porque:

Você está usando um único ponto global de destino (centro da mesa)

Correção

Cada jogador precisa ter um anchor point próprio de aposta

player.betAnchorPosition

A animação deve usar:

animateChip(from: player.position, to: player.betAnchorPosition)

E NÃO:

to: table.center
2. SOBREPOSIÇÃO DO BOTÃO DO DEALER
Problema
botão (BTN) está na mesma camada das fichas
ficha está sendo renderizada por cima
Correção
Ordem de camadas (z-index lógico):
Mesa (base)
→ botão dealer
→ fichas de aposta
→ cartas
→ efeitos

Ou melhor ainda:

z-index:
- dealerButton (baixo)
- playerBetChips (acima)
- animations (topo)

E o botão deve estar levemente deslocado do centro do seat, nunca exatamente onde a ficha vai parar.

3. FICHAS DO CENTRO (POTE) ESTÃO FEIAS
Problema
parecem ícones genéricos
não parecem stack real de fichas
Regra de poker real

O pote precisa parecer:

uma pilha
com profundidade
com cores consistentes
Correção visual
O pote deve ser:
stack vertical (leve perspectiva)
2–4 cores no máximo
leve sombra
base elíptica
Estrutura recomendada
<PotStack>
  <ChipStack layers={3} />
  <AmountLabel>54</AmountLabel>
</PotStack>
4. CARTAS — AINDA NÃO ESTÃO NO PADRÃO CORRETO

Você melhorou, mas ainda não está nível PokerStars.

Problema atual
parecem UI cards
ainda muito "flat"
não têm identidade de baralho
Regra correta

Cartas precisam parecer:

objeto físico
proporção real
tipografia limpa
naipe bem definido
Estrutura correta de carta

Cada carta deve ter:

fundo branco
borda leve
canto superior com valor + naipe
naipe grande no centro (opcional)
leve sombra
Não usar:
fundo escuro
gradiente exagerado
borda pesada
texto centralizado apenas
5. CARTAS DO HERO — POSIÇÃO ERRADA
Problema

Cartas estão presas dentro do card.

Regra correta (como PokerStars)

Cartas ficam fora do card, na frente do jogador.

Estrutura correta
[Seat Card]
(nome, posição, stack)

[Cartas]
(logo abaixo / à frente)

[Aposta]
(mais perto do centro)
Ordem espacial correta
CARD → CARTAS → APOSTA → MESA
6. TAMANHO DA INTERFACE — PROBLEMA DE ALTURA
Problema
tela está muito alta
precisa rolar para acessar botões
Regra

Isso é um replayer → precisa caber na tela

Correção
Reduzir altura total da mesa
limitar altura máxima
usar proporção horizontal maior
Ajustes recomendados
diminuir padding vertical
reduzir tamanho dos cards dos jogadores
reduzir tamanho das cartas (ligeiramente)
reduzir espaçamento vertical
7. AUMENTAR LARGURA DA MESA
Problema

A mesa está comprimida

Correção

Mesa precisa ser:

mais larga
menos alta
formato elíptico horizontal
Resultado esperado
melhor leitura
menos scroll
mais espaço lateral para ações
8. RESUMO DAS CORREÇÕES
Engine
criar destino intermediário de aposta
separar:
bet zone
pot
Animação
ficha → bet zone
depois → pot
Visual
fichas mais realistas
pote com stack real
cartas padrão baralho
cartas fora do card
Layout
reduzir altura
aumentar largura
eliminar scroll desnecessário
Camadas
corrigir z-index
evitar sobreposição do dealer
REGRA FINAL

No poker:

jogador aposta → ficha para na frente dele
rodada termina → fichas vão para o pote

Se a ficha pula direto para o centro, o replay está errado.