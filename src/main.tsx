import React from "react";
import ReactDOM from "react-dom/client";
import { DemoApp } from "../apps/demo/demo/DemoApp.js";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Root element #root not found");
}

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <DemoApp />
  </React.StrictMode>
);
