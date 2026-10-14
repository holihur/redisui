import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { TokenGate } from "./components/app/TokenGate";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <TokenGate>
      <App />
    </TokenGate>
  </StrictMode>,
);
