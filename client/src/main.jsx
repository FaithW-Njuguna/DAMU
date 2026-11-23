import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "./styles.css";
import App from "./App.jsx";
import { AuthProvider } from "./auth.jsx";
import { NotificationsProvider } from "./notifications.jsx";
import { ToastProvider } from "./ui.jsx";
import "./theme.css";
import { ThemeProvider } from "./theme.jsx";

createRoot(document.getElementById("root")).render(
  <BrowserRouter>
    <ThemeProvider>
      <ToastProvider>
        <AuthProvider>
          <NotificationsProvider>
            <App />
          </NotificationsProvider>
        </AuthProvider>
      </ToastProvider>
    </ThemeProvider>
  </BrowserRouter>
);