import React from "react";
import { UploadResult } from "../utils/api";

interface Props {
  maps: UploadResult[];
  activeMapId?: string;
  onUpload: (file: File) => void;
  onSelect: (map: UploadResult) => void;
}

const SidebarLeft: React.FC<Props> = ({ maps, activeMapId, onUpload, onSelect }) => {
  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onUpload(file);
  };

  return (
    <div className="panel sidebar">
      <h3 className="section-title">Maps</h3>
      <label className="field" style={{ alignItems: "center" }}>
        <input type="file" accept="image/png,image/jpeg" onChange={handleUpload} />
      </label>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {maps.map((map) => (
          <button
            key={map.filename}
            onClick={() => onSelect(map)}
            style={{
              background: activeMapId === map.filename ? "#1b7ed6" : undefined
            }}
          >
            {map.filename}
          </button>
        ))}
      </div>
    </div>
  );
};

export default SidebarLeft;
