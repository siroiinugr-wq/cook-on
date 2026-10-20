import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "./index.css";
import App from "./App";
import { ErrorBoundary } from "./components/common/ErrorBoundary";
import { ConfirmProvider } from "./components/common/ConfirmDialog";
import { applySavedBrand } from "./hooks/useBranding";

// 前回の店舗のテーマ色を、最初の描画の前に当てる（一瞬オレンジが見えるのを防ぐ）
applySavedBrand();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <ErrorBoundary>
        <ConfirmProvider>
          <App />
        </ConfirmProvider>
      </ErrorBoundary>
    </BrowserRouter>
  </StrictMode>,
);
