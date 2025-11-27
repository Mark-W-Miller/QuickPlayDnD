import React from "react";
import { TokenDefinition } from "../models/board";

interface Props {
  tokens: TokenDefinition[];
}

const TokenLibrary: React.FC<Props> = ({ tokens }) => {
  return (
    <div className="panel">
      <h3 className="section-title">Token Library</h3>
      {tokens.length === 0 ? (
        <p>Upload SVGs and convert them into usable tokens.</p>
      ) : (
        <div className="token-list">
          {tokens.map((token) => (
            <div className="token-card" key={token.id}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <img src={token.svgUrl} alt={token.name} width={36} height={36} />
                <div>
                  <strong>{token.name}</strong>
                  <div style={{ fontSize: "0.8rem", opacity: 0.7 }}>{token.category}</div>
                </div>
              </div>
              <div style={{ marginTop: 6, fontSize: "0.85rem" }}>Code: {token.code}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default TokenLibrary;
