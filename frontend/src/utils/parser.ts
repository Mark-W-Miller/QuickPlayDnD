import { TokenInstance } from "../models/board";

export type CommandResult =
  | { type: "place"; token: TokenInstance }
  | { type: "move"; tokenId: string; dCol: number; dRow: number }
  | { type: "remove"; tokenId: string }
  | { type: "label"; tokenId: string; label: string }
  | { type: "status"; tokenId: string; status: string };

const coordToIndex = (coord: string) => {
  const [colLetter, ...rowDigits] = coord.toUpperCase();
  const col = colLetter.charCodeAt(0) - 65;
  const row = parseInt(rowDigits.join(""), 10) - 1;
  return { col, row };
};

export function parseCommand(input: string): CommandResult | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const placeMatch = /^PLACE\s+(\w+)\s+@\s*([A-Z]\d+)$/i.exec(trimmed);
  if (placeMatch) {
    const [, code, coord] = placeMatch;
    const { col, row } = coordToIndex(coord);
    return {
      type: "place",
      token: {
        id: `${code}-${Date.now()}`,
        defId: code.toUpperCase(),
        mapId: "",
        col,
        row
      }
    };
  }

  const moveMatch = /^MOVE\s+(\w+)\s+([EW])(\d+)([NS])(\d+)$/i.exec(trimmed);
  if (moveMatch) {
    const [, id, xDir, xAmt, yDir, yAmt] = moveMatch;
    const dCol = (xDir.toUpperCase() === "E" ? 1 : -1) * Number(xAmt);
    const dRow = (yDir.toUpperCase() === "S" ? 1 : -1) * Number(yAmt);
    return { type: "move", tokenId: id.toUpperCase(), dCol, dRow };
  }

  const removeMatch = /^REMOVE\s+(\w+)$/i.exec(trimmed);
  if (removeMatch) {
    return { type: "remove", tokenId: removeMatch[1].toUpperCase() };
  }

  const statusMatch = /^STATUS\s+(\w+)\s*=\s*(.+)$/i.exec(trimmed);
  if (statusMatch) {
    return { type: "status", tokenId: statusMatch[1].toUpperCase(), status: statusMatch[2] };
  }

  const labelMatch = /^LABEL\s+(\w+)\s*=\s*["']?(.+?)["']?$/i.exec(trimmed);
  if (labelMatch) {
    return { type: "label", tokenId: labelMatch[1].toUpperCase(), label: labelMatch[2] };
  }

  return null;
}
