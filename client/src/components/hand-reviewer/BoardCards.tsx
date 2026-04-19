function parseCard(card: string): { rank: string; suit: string; isRed: boolean } {
  const clean = card.trim().toUpperCase();
  const suit = clean.slice(-1);
  const rankRaw = clean.slice(0, -1);
  const rank = rankRaw === "10" ? "T" : rankRaw;
  const isRed = suit === "H" || suit === "D";
  const symbol = suit === "H" ? "♥" : suit === "D" ? "♦" : suit === "C" ? "♣" : "♠";
  return { rank, suit: symbol, isRed };
}

export function BoardCards({ cards }: { cards: string[] }) {
  if (cards.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-nowrap items-center justify-center gap-1.5">
      {cards.map((card, idx) => {
        const parsed = parseCard(card);
        return (
        <div key={`${card}-${idx}`} className="flex h-[78px] w-[56px] flex-col rounded-xl border-2 border-slate-300 bg-white px-1.5 py-1 shadow-[0_10px_18px_rgba(2,6,23,0.35)]">
          <div className={`text-[14px] font-black leading-none ${parsed.isRed ? "text-red-600" : "text-slate-900"}`}>{parsed.rank}</div>
          <div className={`flex flex-1 items-center justify-center text-[31px] font-black leading-none ${parsed.isRed ? "text-red-600" : "text-slate-900"}`}>{parsed.suit}</div>
          <div className={`self-end text-[14px] font-black leading-none ${parsed.isRed ? "text-red-600" : "text-slate-900"}`}>{parsed.rank}</div>
        </div>
      );})}
    </div>
  );
}
