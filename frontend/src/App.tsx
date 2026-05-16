import { Routes, Route } from "react-router-dom";
import { NavRail } from "@/components/shell/NavRail";
import { TopBar } from "@/components/shell/TopBar";
import { EndpointDrawer } from "@/components/detail/EndpointDrawer";
import { useWebSocketBridge } from "@/hooks/useWebSocket";
import CommandCenter from "@/pages/CommandCenter";
import Inventory from "@/pages/Inventory";
import Landscape from "@/pages/Landscape";
import Reports from "@/pages/Reports";

export default function App() {
  useWebSocketBridge();

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-tar text-bone font-mono">
      <NavRail />
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar />
        <main className="relative flex-1 overflow-y-auto">
          <Routes>
            <Route path="/" element={<CommandCenter />} />
            <Route path="/inventory" element={<Inventory />} />
            <Route path="/landscape" element={<Landscape />} />
            <Route path="/reports" element={<Reports />} />
          </Routes>
        </main>
      </div>
      <EndpointDrawer />
    </div>
  );
}
