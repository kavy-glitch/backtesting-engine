import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Layout } from "./components/layout/Layout";
import { EmptyState } from "./components/ui";
import { BacktestPage } from "./pages/BacktestPage";
import { ComparePage } from "./pages/ComparePage";
import { DataPage } from "./pages/DataPage";
import { HistoryPage } from "./pages/HistoryPage";
import { OverviewPage } from "./pages/OverviewPage";
import { StrategiesPage } from "./pages/StrategiesPage";
import { ThemeProvider, ToastProvider } from "./lib/hooks";
import { BootScreen } from "./components/effects/Cinematic";
import type { ReactNode } from "react";

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<OverviewPage />} />
        <Route path="backtest" element={<BacktestPage />} />
        <Route path="backtest/:id" element={<BacktestPage />} />
        <Route path="compare" element={<ComparePage />} />
        <Route path="strategies" element={<StrategiesPage />} />
        <Route path="history" element={<HistoryPage />} />
        <Route path="data" element={<DataPage />} />
        <Route path="*" element={<EmptyState title="Page not found" text="That page does not exist. Use the menu to go somewhere else." />} />
      </Route>
    </Routes>
  );
}

export function Providers({ children }: { children: ReactNode }) {
  return <ThemeProvider><ToastProvider>{children}</ToastProvider></ThemeProvider>;
}

export default function App() {
  return <Providers><BootScreen /><BrowserRouter><AppRoutes /></BrowserRouter></Providers>;
}
