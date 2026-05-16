// Compatibility re-export. The depth meter replaces the old counter strip;
// the file path is preserved so consumers that imported CounterStrip don't
// break, but the new implementation lives in DepthMeter.tsx.
export { DepthMeter as CounterStrip } from "./DepthMeter";
