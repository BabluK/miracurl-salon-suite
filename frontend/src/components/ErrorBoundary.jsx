import { Component } from "react";

/**
 * ErrorBoundary — top-level safety net.
 * Prevents a runtime error in any child route (e.g. Settings, Dashboard) from
 * blanking out the entire app. Shows a graceful retry panel instead.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, message: "" };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, message: error?.message || String(error || "Unknown error") };
  }

  componentDidCatch(error, info) {
    console.error("[ErrorBoundary] caught:", error, info?.componentStack);
  }

  handleReload = () => {
    try {
      window.location.reload();
    } catch (e) {
      console.warn("[ErrorBoundary] reload failed:", e);
    }
  };

  handleHome = () => {
    try {
      window.location.assign("/dashboard");
    } catch (e) {
      console.warn("[ErrorBoundary] navigation failed:", e);
    }
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div
        data-testid="error-boundary-fallback"
        className="min-h-screen flex items-center justify-center bg-[#0A0A0A] text-white px-6"
      >
        <div className="max-w-md w-full text-center">
          <div className="text-5xl mb-6" aria-hidden="true">✦</div>
          <h1 className="font-playfair text-3xl text-gold mb-3">Something went off-script</h1>
          <p className="text-sm text-white/60 mb-6">
            We hit an unexpected error rendering this page. Your data is safe — please reload,
            and if it keeps happening tell us on WhatsApp.
          </p>
          <div className="text-[11px] text-white/30 font-mono mb-6 break-all">
            {this.state.message}
          </div>
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={this.handleReload}
              data-testid="error-boundary-reload"
              className="px-5 py-2.5 rounded-md bg-gold text-bg-base font-semibold text-sm hover:bg-gold/90 transition"
            >
              Reload page
            </button>
            <button
              onClick={this.handleHome}
              data-testid="error-boundary-home"
              className="px-5 py-2.5 rounded-md border border-white/20 text-sm text-white/80 hover:bg-white/5 transition"
            >
              Back to dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }
}
