import React from "react";
import { createRoot } from "react-dom/client";

import App from "./App";
import "./styles.css";

class RootErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; message: string }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: "" };
  }

  static getDerivedStateFromError(error: unknown) {
    return { hasError: true, message: String(error) };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    // Keep an explicit console trace so blank-screen reports are debuggable.
    // eslint-disable-next-line no-console
    console.error("Helix mock frontend crashed", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <main style={{ padding: 24, color: "#fff", background: "#040712", minHeight: "100vh" }}>
          <h1 style={{ marginBottom: 8 }}>Helix mock frontend crashed</h1>
          <p style={{ marginBottom: 12 }}>
            The app hit a runtime error instead of rendering a blank screen.
          </p>
          <pre style={{ whiteSpace: "pre-wrap", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>
            {this.state.message}
          </pre>
        </main>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <RootErrorBoundary>
      <App />
    </RootErrorBoundary>
  </React.StrictMode>
);

(window as unknown as { __helixMounted?: boolean }).__helixMounted = true;
