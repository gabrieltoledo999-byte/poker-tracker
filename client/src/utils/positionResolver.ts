export function resolvePositionLabel(options: {
  seatNumber: number;
  buttonSeat: number;
  maxPlayers: number;
  occupiedSeats: number[];
}): string {
  const labelsByCount: Record<number, string[]> = {
    2: ["BTN", "BB"],
    3: ["BTN", "SB", "BB"],
    4: ["BTN", "SB", "BB", "UTG"],
    5: ["BTN", "SB", "BB", "UTG", "CO"],
    6: ["BTN", "SB", "BB", "UTG", "HJ", "CO"],
    7: ["BTN", "SB", "BB", "UTG", "MP", "HJ", "CO"],
    8: ["BTN", "SB", "BB", "UTG", "UTG+1", "MP", "HJ", "CO"],
    9: ["BTN", "SB", "BB", "UTG", "UTG+1", "MP", "MP+1", "HJ", "CO"],
  };

  const seats = [...options.occupiedSeats]
    .filter(seat => seat >= 1 && seat <= options.maxPlayers)
    .sort((a, b) => {
      const da = (a - options.buttonSeat + options.maxPlayers) % options.maxPlayers;
      const db = (b - options.buttonSeat + options.maxPlayers) % options.maxPlayers;
      return da - db;
    });

  const labels = labelsByCount[Math.min(Math.max(seats.length, 2), 9)] ?? labelsByCount[9];
  const index = seats.findIndex(seat => seat === options.seatNumber);
  if (index < 0) return "";

  return labels[index] ?? `P${index + 1}`;
}
