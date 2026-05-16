import { create } from "zustand";
import type { Classification, DiscoverySource, RiskTier } from "@/types/models";

export interface InventoryFilters {
  classification: Classification | "all";
  risk_tier: RiskTier | "all";
  source: DiscoverySource | "all";
  search: string;
}

export type GraphMode = "normal" | "blast_radius";

interface UiState {
  selectedEndpointId: string | null;
  drawerOpen: boolean;
  inventoryFilters: InventoryFilters;
  graphMode: GraphMode;
  blastRadiusOriginId: string | null;
  openEndpoint: (id: string) => void;
  closeDrawer: () => void;
  setInventoryFilters: (patch: Partial<InventoryFilters>) => void;
  resetInventoryFilters: () => void;
  setGraphMode: (mode: GraphMode, originId?: string | null) => void;
}

const DEFAULT_FILTERS: InventoryFilters = {
  classification: "all",
  risk_tier: "all",
  source: "all",
  search: "",
};

export const useUiStore = create<UiState>((set) => ({
  selectedEndpointId: null,
  drawerOpen: false,
  inventoryFilters: { ...DEFAULT_FILTERS },
  graphMode: "normal",
  blastRadiusOriginId: null,
  openEndpoint: (id) => set({ selectedEndpointId: id, drawerOpen: true }),
  closeDrawer: () => set({ drawerOpen: false }),
  setInventoryFilters: (patch) =>
    set((state) => ({ inventoryFilters: { ...state.inventoryFilters, ...patch } })),
  resetInventoryFilters: () => set({ inventoryFilters: { ...DEFAULT_FILTERS } }),
  setGraphMode: (mode, originId = null) =>
    set({ graphMode: mode, blastRadiusOriginId: originId }),
}));
