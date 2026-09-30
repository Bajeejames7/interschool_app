import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import "./styles.css";
import { AuthProvider, useAuth } from "./lib/auth";
import { queryClient } from "./lib/queries";
import { BASE } from "./lib/base";
import { UpdateWatcher } from "./lib/update";
import { ConfirmProvider } from "./lib/confirm";
import { SAVED_DATA_MAX_AGE, flushOutbox, onFlushed, persister } from "./lib/offline";

// Once changes made offline have reached the server, reload what is shown.
onFlushed(() => void queryClient.invalidateQueries());

// Keep the app itself on the phone so it opens offline (web/sw-template.js).
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register(`${BASE}sw.js`, { scope: BASE }).catch(() => {});
  });
}
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
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        maxAge: SAVED_DATA_MAX_AGE,
        buster: "v1",
        // Keep anything that has data, even if its latest refresh failed —
        // that is exactly the moment (no connection) the saved copy is for.
        dehydrateOptions: { shouldDehydrateQuery: (query) => query.state.data !== undefined },
      }}
      onSuccess={() => void flushOutbox()}
    >
      <AuthProvider>
        <BrowserRouter basename={BASE.replace(/\/$/, "")}>
          <ConfirmProvider>
            <UpdateWatcher />
            <App />
          </ConfirmProvider>
        </BrowserRouter>
      </AuthProvider>
    </PersistQueryClientProvider>
  </StrictMode>,
);
