import React from "react";
import { BoardState, TokenDefinition, TokenInstance } from "../models/board";

interface Props {
  map: BoardState["map"];
  tokenDefs: TokenDefinition[];
  tokens: TokenInstance[];
}

const MapCanvas: React.FC<Props> = ({ map, tokenDefs, tokens }) => {
  if (!map) {
    return (
      <div className="panel map-canvas">
        <p>Load or upload a map to begin.</p>
      </div>
    );
  }

  const scale = map.gridSizePx;

  const getDef = (id: string) => tokenDefs.find((d) => d.id === id);

  return (
    <div className="panel map-canvas">
      <img className="map-img" src={map.imageUrl} alt={map.name} />
      {tokens.map((token) => {
        const def = getDef(token.defId);
        if (!def) return null;
        return (
          <div
            key={token.id}
            className="token"
            style={{
              left: token.col * scale + scale / 2,
              top: token.row * scale + scale / 2,
              width: def.baseSize * scale,
              height: def.baseSize * scale,
              background: def.colorTint ? `${def.colorTint}33` : undefined
            }}
            title={token.labelOverride ?? def.name}
          >
            <img src={def.svgUrl} alt={def.name} style={{ width: "100%", height: "100%" }} />
          </div>
        );
      })}
    </div>
  );
};

export default MapCanvas;
