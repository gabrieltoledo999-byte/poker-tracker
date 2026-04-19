# PROBLEMAS ENCONTRADOS - GG PARSER

## 1. **ggTranslator.ts - Ações não estão sendo convertidas**
- Linha 100: `translateLine()` apenas remove vírgulas, MAS NÃO converte ações GG para PokerStars
- GG usa: `PlayerName: bets $50` ou `PlayerName: raises $100 to $200`
- PokerStars espera: `PlayerName: bets 50` ou `PlayerName: raises 100 to 200`
- **FALTA:** Converter símbolos $ para formato PokerStars

## 2. **PokerTableReplay.tsx - Duplicação de vilões**
- Linha 136-138: Rotação de seats tenta encontrar herói via findIndex
- Se herói nome não corresponder exatamente, TODA rotação falha
- Resultado: vilões renderizam em posições erradas, alguns duplicados

## 3. **Parser PokerStars - Não reconhece formato GG**
- O parser PokerStars espera:
  ```
  *** HOLE CARDS ***
  Dealt to Hero [As Ks]
  Opponent: bets 50
  ```
- GG envia:
  ```
  *** HOLE CARDS ***
  Dealt to Hero [As Ks]
  Opponent: bets $50
  ```
- **$** não é removido → ações não são parseadas → aparecem como texto lixo

## 4. **hand-reviewer.ts - Patterns de detecção fraca para GG**
- Regex patterns podem estar muito restritivos
- Não captura variações de formatação do GG

## SOLUÇÃO NECESSÁRIA
1. Melhorar ggTranslator para converter $ e formatos de ação
2. Adicionar fallback robusto para detecção de herói
3. Testar parsing com output real do GG
