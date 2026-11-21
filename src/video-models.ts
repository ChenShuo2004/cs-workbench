import catalog from "../shared/video-models.json";
import type { CanvasGenerator } from "./types";
export const videoModels = catalog;
export const videoModel = (id?: string) =>
  videoModels.find((m) => m.id === id) || videoModels[0];
export const videoModelChange = (id: string, resolution?: string) => {
  const model = videoModel(id);
  return {
    model: model.id,
    resolution: (resolution && model.resolutions.includes(resolution)
      ? resolution
      : model.defaultResolution) as CanvasGenerator["resolution"],
  };
};
