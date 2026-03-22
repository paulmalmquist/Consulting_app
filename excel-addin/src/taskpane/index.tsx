import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";

const start = () => {
  const rootElement = document.getElementById("root");
  if (!rootElement) {
    return;
  }
  const root = createRoot(rootElement);
  root.render(<App />);
};

if (typeof Office !== "undefined") {
  Office.onReady(() => start());
} else {
  start();
}
