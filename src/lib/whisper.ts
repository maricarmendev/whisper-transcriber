export const MODELS = ["tiny", "base", "small"] as const;
export type Model = (typeof MODELS)[number];

export function isModel(value: unknown): value is Model {
  return typeof value === "string" && (MODELS as readonly string[]).includes(value);
}

export const MAX_BYTES = 100 * 1024 * 1024;
export const MAX_BYTES_LABEL = "100 MB";

export const ACCEPTED_EXTENSIONS = [".ogg", ".mp3", ".m4a", ".wav", ".webm"] as const;
export const ACCEPT_ATTR = `${ACCEPTED_EXTENSIONS.join(",")},audio/*`;
