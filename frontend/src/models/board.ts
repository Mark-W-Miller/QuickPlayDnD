export type GridType = "square" | "hex";

export interface BattleMapConfig {
  id: string;
  name: string;
  imageUrl: string;
  gridType: GridType;
  gridSizePx: number;
  originX: number;
  originY: number;
  cols: number;
  rows: number;
}

export type TokenCategory = "PC" | "NPC" | "Monster" | "Object";

export interface TokenDefinition {
  id: string;
  code: string;
  name: string;
  category: TokenCategory;
  svgUrl: string;
  baseSize: number;
  colorTint?: string;
}

export interface TokenInstance {
  id: string;
  defId: string;
  mapId: string;
  col: number;
  row: number;
  facingDeg?: number;
  status?: string[];
  labelOverride?: string;
}

export interface BoardState {
  map: BattleMapConfig | null;
  tokenDefs: TokenDefinition[];
  tokens: TokenInstance[];
}
