import React, { useEffect, useState } from "react";
import MapCanvas from "./components/MapCanvas";
import CommandConsole from "./components/CommandConsole";
import TokenLibrary from "./components/TokenLibrary";
import SidebarLeft from "./components/SidebarLeft";
import SidebarRight from "./components/SidebarRight";
import { useBoardState } from "./hooks/useBoardState";
import {
  hydrateMap,
  hydrateToken,
  listMaps,
  listTokens,
  loadBoardState,
  saveBoardState,
  uploadMap,
  uploadToken,
  UploadResult
} from "./utils/api";
import { BoardState } from "./models/board";

const App: React.FC = () => {
  const { state, setMap, addTokenDefinition, applyCommand, log, appendLog, replaceState } = useBoardState();
  const [maps, setMaps] = useState<UploadResult[]>([]);
  const [tokens, setTokens] = useState<UploadResult[]>([]);

  useEffect(() => {
    const hydrate = async () => {
      try {
        const [mapRes, tokenRes] = await Promise.all([listMaps(), listTokens()]);
        setMaps(mapRes);
        setTokens(tokenRes);
        if (mapRes.length && !state.map) {
          setMap(hydrateMap(mapRes[0]));
        }
        tokenRes.forEach((t) => addTokenDefinition(hydrateToken(t)));
      } catch (err) {
        console.error(err);
      }
    };
    hydrate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleMapUpload = async (file: File) => {
    try {
      const uploaded = await uploadMap(file);
      setMaps((prev) => [uploaded, ...prev]);
      setMap(hydrateMap(uploaded));
      appendLog(`Uploaded map ${uploaded.filename}`);
    } catch (err) {
      appendLog("Map upload failed");
      console.error(err);
    }
  };

  const handleMapSelect = (map: UploadResult) => {
    setMap(hydrateMap(map));
  };

  const handleTokenUpload = async (file: File) => {
    try {
      const uploaded = await uploadToken(file);
      setTokens((prev) => [uploaded, ...prev]);
      const def = hydrateToken(uploaded);
      addTokenDefinition(def);
      appendLog(`Uploaded token ${uploaded.filename}`);
    } catch (err) {
      appendLog("Token upload failed");
      console.error(err);
    }
  };

  const saveStateToServer = async () => {
    try {
      const id = await saveBoardState(state);
      appendLog(`Saved board state: ${id}`);
    } catch (err) {
      appendLog("Save failed");
      console.error(err);
    }
  };

  const loadStateFromServer = async (id: string) => {
    try {
      const remote = (await loadBoardState(id)) as BoardState;
      replaceState(remote);
    } catch (err) {
      appendLog("Load failed");
      console.error(err);
    }
  };

  return (
    <div className="app-shell">
      <div className="panel header">
        <div className="title">Tactical Battle Board</div>
        <div className="tag">Node + React</div>
      </div>

      <div className="left">
        <SidebarLeft maps={maps} activeMapId={state.map?.id} onUpload={handleMapUpload} onSelect={handleMapSelect} />
      </div>

      <div className="main">
        <MapCanvas map={state.map} tokenDefs={state.tokenDefs} tokens={state.tokens} />
        <CommandConsole onCommand={applyCommand} log={log} />
      </div>

      <div className="right">
        <SidebarRight onUploadToken={handleTokenUpload} onSaveState={saveStateToServer} onLoadState={loadStateFromServer} />
        <TokenLibrary tokens={state.tokenDefs} />
      </div>
    </div>
  );
};

export default App;
