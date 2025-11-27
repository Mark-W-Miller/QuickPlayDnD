import React, { useState } from "react";

interface Props {
  onUploadToken: (file: File) => void;
  onSaveState: () => Promise<void>;
  onLoadState: (id: string) => Promise<void>;
}

const SidebarRight: React.FC<Props> = ({ onUploadToken, onSaveState, onLoadState }) => {
  const [loadId, setLoadId] = useState("");

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onUploadToken(file);
  };

  const load = async () => {
    if (!loadId.trim()) return;
    await onLoadState(loadId.trim());
  };

  return (
    <div className="panel sidebar">
      <h3 className="section-title">Tokens</h3>
      <label className="field" style={{ alignItems: "center" }}>
        <input type="file" accept="image/svg+xml" onChange={handleUpload} />
      </label>

      <h3 className="section-title">Board State</h3>
      <button onClick={onSaveState}>Save State</button>
      <div className="field">
        <input
          placeholder="Load ID"
          value={loadId}
          onChange={(e) => setLoadId(e.target.value)}
        />
        <button onClick={load}>Load</button>
      </div>
    </div>
  );
};

export default SidebarRight;
