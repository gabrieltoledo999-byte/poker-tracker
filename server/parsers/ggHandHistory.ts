/**
 * GG Hand History Parser
 * Extracts structured data from GG Poker hand history text
 */

export type GGHandData = {
  handId: string;
  gameFormat: string;
  stakes: string;
  smallBlind: number;
  bigBlind: number;
  hero: string;
  heroPosicao: string;
  heroCards: string[];
  heroStartStack: number;
  heroFinalStack: number;
  players: GGPlayer[];
  tableSize: number;
  currency: string;
  potSize: number;
  result: "win" | "loss" | "fold" | "unknown";
  streets: GGStreet[];
  timestamp?: Date;
};

export type GGPlayer = {
  seat: number;
  name: string;
  stack: number;
  position: string;
};

export type GGStreet = {
  name: string;
  cards?: string;
  actions: GGAction[];
  potAfter: number;
};

export type GGAction = {
  player: string;
  action: string;
  amount?: number;
};

/**
 * Parse GG hand history raw text
 * Suporta formatos simples de hand history do GG
 */
export function parseGGHandHistory(rawText: string): GGHandData | null {
  try {
    const lines = rawText.split("\n").filter((l) => l.trim());
    if (lines.length < 3) return null;

    const data: Partial<GGHandData> = {
      streets: [],
      players: [],
      result: "unknown",
      currency: "USD",
    };

    // ─ Extrair Hand ID e Stakes da primeira linha
    // Ex: "GGPoker #1234567 | NLHE | Sb 0.25 Bb 0.50"
    const headerLine = lines[0];
    const handIdMatch = headerLine.match(/#(\d+)/);
    if (handIdMatch) {
      data.handId = handIdMatch[1];
    }

    // Detectar stakes em vários formatos
    const stakeMatch = headerLine.match(/(?:Sb|SB|sb)\s+([\d.]+)\s+(?:Bb|BB|bb)\s+([\d.]+)|Limit:\s*[\$€]?([\d.]+)\/[\$€]?([\d.]+)/i);
    if (stakeMatch) {
      if (stakeMatch[1]) {
        data.smallBlind = parseFloat(stakeMatch[1]);
        data.bigBlind = parseFloat(stakeMatch[2]);
        data.stakes = `${stakeMatch[1]}/${stakeMatch[2]}`;
      } else if (stakeMatch[3]) {
        data.smallBlind = parseFloat(stakeMatch[3]);
        data.bigBlind = parseFloat(stakeMatch[4]);
        data.stakes = `${stakeMatch[3]}/${stakeMatch[4]}`;
      }
    }

    // Detectar formato de jogo
    if (headerLine.toLowerCase().includes("nlhe") || headerLine.toLowerCase().includes("hold'em")) {
      data.gameFormat = "holdem";
    } else if (headerLine.toLowerCase().includes("omaha")) {
      data.gameFormat = "omaha";
    } else {
      data.gameFormat = "holdem";
    }

    // ─ Parse Seats e Players (procura por "Seat X:" ou "SeatX:")
    const seatPattern = /Seat\s+(\d+):\s*([^\s]+)\s*\([\$€]?([\d,.]+)\)/gi;
    let seatMatch;
    const playerMap = new Map<string, GGPlayer>();

    while ((seatMatch = seatPattern.exec(rawText)) !== null) {
      const seatNum = parseInt(seatMatch[1]);
      const playerName = seatMatch[2];
      const stackStr = seatMatch[3].replace(/[,]/g, ""); // Remove vírgulas (em locales europeus)
      const stack = parseFloat(stackStr) * 100; // Converter para cents

      const player: GGPlayer = {
        seat: seatNum,
        name: playerName,
        stack: stack,
        position: getPositionFromSeat(seatNum, 6), // Default 6-max
      };

      playerMap.set(playerName.toLowerCase(), player);
      if (!data.players) data.players = [];
      data.players.push(player);
    }

    data.tableSize = data.players?.length || 6;

    // ─ Detectar Hero (procura por "Hero" ou indicadores)
    // Procura por linhas tipo "Hero: PlayerName" ou o primeiro player com cards
    const heroLine = rawText.match(/Hero\s*[:=]\s*([^\n\r]+)/i);
    if (heroLine) {
      const heroName = heroLine[1].trim().split(/[\s|,]/)[0];
      data.hero = heroName;

      const heroPlayer = Array.from(playerMap.values()).find(
        (p) => p.name.toLowerCase() === heroName.toLowerCase()
      );
      if (heroPlayer) {
        data.heroPosicao = heroPlayer.position;
        data.heroStartStack = heroPlayer.stack;
      }
    } else {
      // Tentar detectar pela primeira linha que tem cards
      const cardsPattern = /\*?\*?(?:Hole Cards|Cards)?\*?\*?[\s]*\[(\w+)\]\s*\[(\w+)\]/i;
      const cardsMatch = rawText.match(cardsPattern);
      if (cardsMatch && data.players && data.players.length > 0) {
        data.hero = data.players[0].name;
        data.heroPosicao = data.players[0].position;
        data.heroStartStack = data.players[0].stack;
      }
    }

    // ─ Parse Hero Cards
    const heroCardsMatch = rawText.match(/\*?\*?(?:Hole|Cards)?\*?\*?\s*\[(\w{2})\]\s*\[(\w{2})\]/i);
    if (heroCardsMatch) {
      data.heroCards = [
        formatCard(heroCardsMatch[1]),
        formatCard(heroCardsMatch[2]),
      ];
    }

    // ─ Parse Streets (Flop, Turn, River)
    const streetPatterns = [
      { name: "preflop", regex: /\*?\*?Preflop\*?\*?|^\*\*\*(.+?)$/m },
      { name: "flop", regex: /\*?\*?Flop\*?\*?\s*\[([^\]]+)\]/i },
      { name: "turn", regex: /\*?\*?Turn\*?\*?\s*\[([^\]]+)\]/i },
      { name: "river", regex: /\*?\*?River\*?\*?\s*\[([^\]]+)\]/i },
    ];

    for (const streetDef of streetPatterns) {
      const streetMatch = rawText.match(streetDef.regex);
      if (streetMatch) {
        const street: GGStreet = {
          name: streetDef.name,
          cards: streetMatch[1] || undefined,
          actions: [],
          potAfter: 0,
        };

        // Extrair ações para este street (próximas linhas após a detecção)
        const streetStart = rawText.indexOf(streetMatch[0]);
        const nextStreetMatch = rawText.substring(streetStart + 10).match(/\*?\*?(Flop|Turn|River|Summary)\*?\*?/i);
        const streetEnd = nextStreetMatch ? streetStart + 10 + rawText.substring(streetStart + 10).indexOf(nextStreetMatch[0]) : rawText.length;

        const streetText = rawText.substring(streetStart, streetEnd);
        parseStreetActions(streetText.split("\n"), street);

        data.streets!.push(street);
      }
    }

    // ─ Parse Final Stack e Resultado
    if (data.hero) {
      // Procura por linhas finais que indicam resultado
      const resultPatterns = [
        new RegExp(`${data.hero}.*?collected.*?\\$([\\d,.]+)`, "i"),
        new RegExp(`${data.hero}.*?won.*?\\$([\\d,.]+)`, "i"),
        new RegExp(`${data.hero}.*?loses.*?\\$([\\d,.]+)`, "i"),
        new RegExp(`${data.hero}.*?\\(([\\d,.]+)\\).*?(?:returned|folded|lost)`, "i"),
      ];

      for (const pattern of resultPatterns) {
        const resultMatch = rawText.match(pattern);
        if (resultMatch && resultMatch[1]) {
          const amount = parseFloat(resultMatch[1].replace(/[,]/g, "")) * 100;
          if (pattern.source.includes("collected") || pattern.source.includes("won")) {
            data.heroFinalStack = (data.heroStartStack || 0) + amount;
            data.result = "win";
          } else {
            data.heroFinalStack = Math.max(0, (data.heroStartStack || 0) - amount);
            data.result = "loss";
          }
          break;
        }
      }
    }

    // Se não conseguiu extrair final stack, usa start stack
    if (!data.heroFinalStack && data.heroStartStack) {
      data.heroFinalStack = data.heroStartStack;
    }

    // ─ Parse Total Pot
    const potMatch = rawText.match(/(?:Total\s+)?[Pp]ot\s*[:\s]+[\$€]?([\d,.]+)/);
    if (potMatch) {
      data.potSize = parseFloat(potMatch[1].replace(/[,]/g, "")) * 100;
    }

    // ─ Extrair timestamp se existir
    const dateMatch = rawText.match(/(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})/);
    if (dateMatch) {
      data.timestamp = new Date(dateMatch[1]);
    }

    return data as GGHandData;
  } catch (error) {
    console.error("GG Hand History Parse Error:", error);
    return null;
  }
}

/**
 * Parse actions for a street
 */
function parseStreetActions(
  lines: string[],
  street: GGStreet
): void {
  for (const line of lines) {
    if (!line.trim()) continue;

    // Stop at next street or summary
    if (line.match(/\*?\*?(Flop|Turn|River|Summary|Preflop|Hole)\*?\*?/i)) break;

    // Parse action: "PlayerName: bets $1.00" ou "PlayerName bets 1.00"
    const actionMatch = line.match(/^([^:]+?)(?:\s*:|^)\s+(folds?|checks?|bets?|raises?|calls?|allin?)(?:\s*[\$€]?([\d.]+))?/i);
    if (actionMatch) {
      street.actions.push({
        player: actionMatch[1].trim(),
        action: actionMatch[2].toLowerCase(),
        amount: actionMatch[3] ? parseFloat(actionMatch[3]) * 100 : undefined,
      });
    }

    // Parse pot: "Pot: $1.50" ou "Pot = $1.50"
    const potMatch = line.match(/(?:Pot\s*[:=]\s*)?[\$€]?([\d,.]+)(?:\s+total)?/i);
    if (potMatch && line.toLowerCase().includes("pot")) {
      street.potAfter = parseFloat(potMatch[1].replace(/[,]/g, "")) * 100;
    }
  }
}

/**
 * Format card notation (As -> A♠, Kh -> K♥, etc)
 */
function formatCard(card: string): string {
  if (!card || card.length < 2) return card;

  const rankMap: Record<string, string> = {
    A: "A",
    K: "K",
    Q: "Q",
    J: "J",
    T: "T",
    "9": "9",
    "8": "8",
    "7": "7",
    "6": "6",
    "5": "5",
    "4": "4",
    "3": "3",
    "2": "2",
  };

  const suitMap: Record<string, string> = {
    s: "♠",
    h: "♥",
    d: "♦",
    c: "♣",
    S: "♠",
    H: "♥",
    D: "♦",
    C: "♣",
  };

  const rank = rankMap[card[0]] || card[0];
  const suit = suitMap[card[1]] || card[1];
  return `${rank}${suit}`;
}

/**
 * Map seat number to position
 */
function getPositionFromSeat(seat: number, tableSize: number): string {
  if (tableSize <= 3) {
    return ["BTN", "SB", "BB"][seat % 3];
  }

  if (tableSize === 6) {
    return ["UTG", "MP", "CO", "BTN", "SB", "BB"][seat % 6];
  }

  if (tableSize === 9) {
    return [
      "UTG",
      "UTG+1",
      "UTG+2",
      "MP",
      "MP+1",
      "CO",
      "BTN",
      "SB",
      "BB",
    ][seat % 9];
  }

  return `SEAT ${seat}`;
}
