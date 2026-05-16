import { create } from "zustand";
import type { ScanEvent, ScanStats, ScanStatus } from "@/types/models";

const FEED_CAP = 200;

interface LiveState {
  scanId: string | null;
  scanStatus: ScanStatus | "idle";
  progress: number;
  liveStats: ScanStats | null;
  feed: ScanEvent[];
  startScan: (scanId: string) => void;
  setProgress: (progress: number, stats: ScanStats) => void;
  appendEvent: (event: ScanEvent) => void;
  completeScan: () => void;
  reset: () => void;
}

export const useLiveStore = create<LiveState>((set) => ({
  scanId: null,
  scanStatus: "idle",
  progress: 0,
  liveStats: null,
  feed: [],
  startScan: (scanId) =>
    set({
      scanId,
      scanStatus: "running",
      progress: 0,
      feed: [],
      liveStats: null,
    }),
  setProgress: (progress, stats) =>
    set({
      progress,
      liveStats: stats,
    }),
  appendEvent: (event) =>
    set((state) => {
      const next = state.feed.length >= FEED_CAP ? state.feed.slice(-FEED_CAP + 1) : state.feed;
      return { feed: [...next, event] };
    }),
  completeScan: () =>
    set({
      scanStatus: "complete",
      progress: 100,
    }),
  reset: () =>
    set({
      scanId: null,
      scanStatus: "idle",
      progress: 0,
      liveStats: null,
      feed: [],
    }),
}));
