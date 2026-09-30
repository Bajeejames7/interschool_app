import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import "./styles.css";
import { AuthProvider, useAuth } from "./lib/auth";
import { queryClient } from "./lib/queries";
import { BASE } from "./lib/base";
import { UpdateWatcher } from "./lib/update";
import { ProgramShell } from "./components/ProgramShell";
import { Spinner } from "./components/ui";
import { AuthPage } from "./pages/AuthPage";
import { SchoolsPage } from "./pages/SchoolsPage";
import { ProgramHome } from "./pages/ProgramHome";
import { SessionPage } from "./pages/SessionPage";
import { CalendarPage } from "./pages/CalendarPage";
import { TallyPage } from "./pages/TallyPage";
import { SettingsPage } from "./pages/SettingsPage";
import { PeoplePage } from "./pages/PeoplePage";
import { AccountPage } from "./pages/AccountPage";

function SignedIn({ children }: { children: React.ReactNode }) {
  const { me, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Spinner />;
  if (!me) return <Navigate to="/signin" replace state={{ from: location.pathname }} />;
  // An account made by a super admin starts on a temporary password.
  if (me.mustChangePassword && location.pathname !== "/account") return <Navigate to="/account" replace />;
  return <>{children}</>;
}

function App() {
  return (
    <Routes>
      <Route path="/signin" element={<AuthPage />} />
      <Route path="/signup" element={<Navigate to="/signin" replace />} />
      <Route path="/" element={<SignedIn><SchoolsPage /></SignedIn>} />
      <Route path="/people" element={<SignedIn><PeoplePage /></SignedIn>} />
      <Route path="/account" element={<SignedIn><AccountPage /></SignedIn>} />
      <Route path="/p/:slug" element={<SignedIn><ProgramShell /></SignedIn>}>
        <Route index element={<ProgramHome />} />
        <Route path="session" element={<SessionPage />} />
        <Route path="session/:date" element={<SessionPage />} />
        <Route path="calendar" element={<CalendarPage />} />
        <Route path="tally" element={<TallyPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter basename={BASE.replace(/\/$/, "")}>
          <UpdateWatcher />
          <App />
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
);
