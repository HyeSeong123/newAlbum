import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";
import "./design-system.css";
import "./features/albums/albums.css";
import "./features/calendar/calendar.css";
import "./controls.css";
import "./features/media/photo-detail.css";
import "./components/media-visual.css";
import "./brand.css";
import "./features/albums/album-library.css";
import "./android.css";
import "./mobile-controls.css";
import { isAndroidRuntime } from "./services/tauriMediaService";
import { observeMobileViewport } from "./services/mobileViewport";

document.documentElement.dataset.platform = isAndroidRuntime() ? "android" : "desktop";
if (isAndroidRuntime()) observeMobileViewport();

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
