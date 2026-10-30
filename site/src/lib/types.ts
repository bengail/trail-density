// Shapes of the JSON written by scripts/export.mjs.

export type Gender = "M" | "F";
export type Format = "vertical" | "short" | "medium" | "long" | "ultra" | null;

export interface Runner {
  rank: number;
  overall: number;
  name: string;
  nat: string | null;
  index: number;
  time_s: number | null;
}

export interface GenderBlock {
  n: number;
  normalization: string;
  rci3: number | null;
  rci5: number | null;
  rci10: number | null;
  rci20: number | null;
  curve: number[];
  hist: { start: number; step: number; bins: number; counts: number[] };
  depth: Record<string, number>;
  gap_1_10: number | null;
  top10: Runner[];
}

export interface Edition {
  year: number;
  date: string | null;
  distance_km: number | null;
  elevation_gain: number | null;
  series: string[];
  source: Source;                                   // primary source, copied to M / F
  sources: Partial<Record<Source, SourceBlock>>;
  M?: GenderBlock;
  F?: GenderBlock;
}

export type Source = "itra" | "utmb" | "legacy";

export interface SourceBlock {
  warnings: string[];
  M?: GenderBlock;
  F?: GenderBlock;
}

interface RaceBase {
  id: string;
  name: string;
  event: { id: string; name: string };
  country: string | null;
  discipline: string;
  format: Format;
  distance_km: number | null;
  elevation_gain: number | null;
  series: string[];
}

export interface Race extends RaceBase {
  sources: Source[];
  editions: Edition[];
}

export interface RaceSummary extends RaceBase {
  editions: { year: number; source: string; M: { n: number; rci10: number | null } | null; F: { n: number; rci10: number | null } | null }[];
}

export interface Index {
  generated_at: string;
  races: RaceSummary[];
}
