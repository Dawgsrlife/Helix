"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertCircle, RotateCcw } from "lucide-react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[Helix ErrorBoundary]", error, info.componentStack);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div
          className="flex flex-col items-center justify-center gap-4 p-8 min-h-[200px]"
          role="alert"
        >
          <AlertCircle
            size={32}
            style={{ color: "var(--base-t)", opacity: 0.7 }}
            aria-hidden="true"
          />
          <div className="text-center space-y-1">
            <h2
              className="text-sm font-semibold"
              style={{ color: "var(--text-primary)" }}
            >
              Something went wrong
            </h2>
            <p
              className="text-xs max-w-md"
              style={{ color: "var(--text-muted)" }}
            >
              {this.state.error?.message || "An unexpected error occurred."}
            </p>
          </div>
          <button
            onClick={this.handleReset}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium transition-colors hover:bg-white/[0.06]"
            style={{
              background: "var(--surface-elevated)",
              color: "var(--accent)",
            }}
          >
            <RotateCcw size={12} aria-hidden="true" />
            Try again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
