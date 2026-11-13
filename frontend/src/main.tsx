import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { AuthProvider } from "./contexts/AuthContext";
import { EmployeeAuthProvider } from "./contexts/EmployeeAuthContext";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter
      future={{
        v7_startTransition: true,
        v7_relativeSplatPath: true,
      }}
    >
      {/* Platform and employee sessions are independent realms, so both are
          provided: the employee dashboards sign the user out of each in turn. */}
      <AuthProvider>
        <EmployeeAuthProvider>
          <App />
        </EmployeeAuthProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);