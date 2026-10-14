import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { TokenGate } from "./components/app/TokenGate";
import { I18nProvider } from "./lib/i18n";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <I18nProvider>
      <TokenGate>
        <App />
      </TokenGate>
    </I18nProvider>
  </StrictMode>,
);
