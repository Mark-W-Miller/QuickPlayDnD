import axios from "axios";
import { BattleMapConfig, TokenDefinition } from "../models/board";

const api = axios.create({
  baseURL: __API_URL__ || "http://localhost:4000"
});

export interface UploadResult {
  filename: string;
  url: string;
}

export const listMaps = async (): Promise<UploadResult[]> => {
  const { data } = await api.get("/api/media/maps");
  return data;
};

export const listTokens = async (): Promise<UploadResult[]> => {
  const { data } = await api.get("/api/media/tokens");
  return data;
};

export const uploadMap = async (file: File): Promise<UploadResult> => {
  const formData = new FormData();
  formData.append("map", file);
  const { data } = await api.post("/api/media/map", formData, {
    headers: { "Content-Type": "multipart/form-data" }
  });
  return data;
};

export const uploadToken = async (file: File): Promise<UploadResult> => {
  const formData = new FormData();
  formData.append("token", file);
  const { data } = await api.post("/api/media/token", formData, {
    headers: { "Content-Type": "multipart/form-data" }
  });
  return data;
};

export const saveBoardState = async (state: unknown): Promise<string> => {
  const { data } = await api.post("/api/state/save", state);
  return data.id;
};

export const loadBoardState = async (id: string): Promise<unknown> => {
  const { data } = await api.get(`/api/state/${id}`);
  return data;
};

export const hydrateMap = (upload: UploadResult): BattleMapConfig => ({
  id: upload.filename,
  name: upload.filename,
  imageUrl: upload.url,
  gridType: "square",
  gridSizePx: 50,
  originX: 0,
  originY: 0,
  cols: 20,
  rows: 20
});

export const hydrateToken = (upload: UploadResult): TokenDefinition => ({
  id: upload.filename,
  code: upload.filename.slice(0, 3).toUpperCase(),
  name: upload.filename,
  category: "Object",
  svgUrl: upload.url,
  baseSize: 1
});
