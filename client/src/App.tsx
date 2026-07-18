import { Navigate, Route, BrowserRouter, Routes } from "react-router-dom";
import type { ReactElement } from "react";
import { AuthProvider, useAuth } from "./auth/AuthContext";
import { AuthPage } from "./pages/AuthPage";
import { DocumentsPage } from "./pages/DocumentsPage";
import { EditorPage } from "./pages/EditorPage";
import { JoinPage } from "./pages/JoinPage";
import "./App.css";

function RequireAuth({ children }: { children: ReactElement }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<AuthPage />} />
      <Route
        path="/documents"
        element={
          <RequireAuth>
            <DocumentsPage />
          </RequireAuth>
        }
      />
      <Route
        path="/documents/:id"
        element={
          <RequireAuth>
            <EditorPage />
          </RequireAuth>
        }
      />
      <Route
        path="/join/:token"
        element={
          <RequireAuth>
            <JoinPage />
          </RequireAuth>
        }
      />
      <Route path="*" element={<Navigate to="/documents" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
