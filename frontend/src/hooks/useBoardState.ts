import { useEffect, useMemo, useState } from "react";
import { BoardState, TokenDefinition, TokenInstance } from "../models/board";
import { parseCommand, CommandResult } from "../utils/parser";

const STORAGE_KEY = "tactical-board-state";

const defaultState: BoardState = {
  map: null,
  tokenDefs: [],
  tokens: []
};

const loadState = (): BoardState => {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return defaultState;
  try {
    return JSON.parse(raw);
  } catch {
    return defaultState;
  }
};

export const useBoardState = () => {
  const [state, setState] = useState<BoardState>(defaultState);
  const [log, setLog] = useState<string[]>([]);

  useEffect(() => {
    setState(loadState());
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  const appendLog = (entry: string) => setLog((prev) => [`${new Date().toLocaleTimeString()} — ${entry}`, ...prev].slice(0, 12));

  const setMap = (map: BoardState["map"]) => {
    setState((prev) => ({ ...prev, map }));
    if (map) appendLog(`Loaded map ${map.name}`);
  };

  const replaceState = (next: BoardState) => {
    setState(next);
    appendLog("Board state loaded");
  };

  const addTokenDefinition = (def: TokenDefinition) => {
    setState((prev) => ({ ...prev, tokenDefs: [...prev.tokenDefs, def] }));
  };

  const upsertToken = (token: TokenInstance) => {
    setState((prev) => {
      const existing = prev.tokens.find((t) => t.id === token.id);
      if (existing) {
        return { ...prev, tokens: prev.tokens.map((t) => (t.id === token.id ? token : t)) };
      }
      return { ...prev, tokens: [...prev.tokens, token] };
    });
  };

  const removeToken = (tokenId: string) => {
    setState((prev) => ({ ...prev, tokens: prev.tokens.filter((t) => t.id !== tokenId) }));
  };

  const applyCommand = (input: string) => {
    const parsed = parseCommand(input);
    if (!parsed) {
      appendLog(`Could not parse: "${input}"`);
      return;
    }

    handleCommand(parsed);
    appendLog(input);
  };

  const handleCommand = (cmd: CommandResult) => {
    switch (cmd.type) {
      case "place": {
        const tokenDef = state.tokenDefs.find((d) => d.code === cmd.token.defId);
        if (!tokenDef) {
          appendLog(`Unknown token code ${cmd.token.defId}`);
          return;
        }
        upsertToken({ ...cmd.token, mapId: state.map?.id ?? "", defId: tokenDef.id });
        break;
      }
      case "move": {
        const token = state.tokens.find((t) => t.id.startsWith(cmd.tokenId));
        if (!token) {
          appendLog(`Token ${cmd.tokenId} not found`);
          return;
        }
        upsertToken({ ...token, col: token.col + cmd.dCol, row: token.row + cmd.dRow });
        break;
      }
      case "remove":
        removeToken(cmd.tokenId);
        break;
      case "label": {
        const token = state.tokens.find((t) => t.id.startsWith(cmd.tokenId));
        if (token) upsertToken({ ...token, labelOverride: cmd.label });
        break;
      }
      case "status": {
        const token = state.tokens.find((t) => t.id.startsWith(cmd.tokenId));
        if (token) {
          const current = new Set(token.status ?? []);
          current.add(cmd.status);
          upsertToken({ ...token, status: Array.from(current) });
        }
        break;
      }
      default:
        break;
    }
  };

  const helpers = useMemo(
    () => ({
      setMap,
      addTokenDefinition,
      upsertToken,
      removeToken,
      applyCommand,
      replaceState
    }),
    [state]
  );

  return { state, log, appendLog, ...helpers };
};
