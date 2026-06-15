import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import Login from "./pages/Login";
import Onboarding from "./pages/Onboarding";
import ClientPortal from "./pages/ClientPortal";
import ManagerPortal from "./pages/ManagerPortal";
import LogistPortal from "./pages/LogistPortal";
import AdminPortal from "./pages/AdminPortal";
import UsersAdmin from "./pages/UsersAdmin";
import NotFound from "./pages/NotFound";

import RequireAuth from "./components/auth/RequireAuth";
import { getCurrentUser, getHomeByRole } from "./lib/auth";

const queryClient = new QueryClient();

function RootRedirect() {
  const user = getCurrentUser();
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === "admin") return <Navigate to="/admin" replace />;
  return <Navigate to={getHomeByRole(user.role)} replace />;
}


const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          {/* Public */}
          <Route path="/login" element={<Login />} />

          {/* Admin — дашборд платформы */}
          <Route path="/" element={
            <RequireAuth roles={["admin"]}>
              <RootRedirect />
            </RequireAuth>
          } />

          {/* Admin — управление пользователями */}
          <Route path="/users" element={
            <RequireAuth roles={["admin"]}>
              <UsersAdmin />
            </RequireAuth>
          } />

          {/* Onboarding — admin/manager */}
          <Route path="/onboarding" element={
            <RequireAuth roles={["admin", "manager"]}>
              <Onboarding />
            </RequireAuth>
          } />

          {/* Manager */}
          <Route path="/manager" element={
            <RequireAuth roles={["admin", "manager"]}>
              <ManagerPortal />
            </RequireAuth>
          } />

          {/* Client */}
          <Route path="/client" element={
            <RequireAuth roles={["admin", "manager", "client"]}>
              <ClientPortal />
            </RequireAuth>
          } />

          {/* Logist */}
          <Route path="/logist" element={
            <RequireAuth roles={["admin", "manager", "logist"]}>
              <LogistPortal />
            </RequireAuth>
          } />

          {/* Admin Portal */}
          <Route path="/admin" element={
            <RequireAuth roles={["admin"]}>
              <AdminPortal />
            </RequireAuth>
          } />

          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;