import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
// Keep feature styles before the shared/mobile overrides when its UI loads lazily.
import "./features/people/people.css";
import "./components/entity-editor.css";
import "./components/entity-photo-picker.css";
import "./features/entities/entities.css";
import "./features/pets/pets.css";
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
