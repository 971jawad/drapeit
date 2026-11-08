import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: boolean }
> {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  render() {
    return this.state.error ? (
      <main className="fatal">
        <h1>Let’s start fresh.</h1>
        <p>
          The fitting room encountered an unexpected error. Your camera will
          stop when you reload.
        </p>
        <button onClick={() => location.reload()}>Reload DrapeIt</button>
      </main>
    ) : (
      this.props.children
    );
  }
}
if (
  (typeof chrome !== "undefined" && chrome.runtime?.id) ||
  new URLSearchParams(location.search).get("window") === "1"
)
  document.documentElement.classList.add("extension-window");
ReactDOM.createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);
