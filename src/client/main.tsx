import React from "react";
import ReactDOM from "react-dom/client";
// import "@excalidraw/excalidraw/index.css";  // CSS is now included in the JS bundle
import "./styles.css";
import App from "./App";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Root element not found");
}

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
