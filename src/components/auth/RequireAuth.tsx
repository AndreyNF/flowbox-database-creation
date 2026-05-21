import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { getCurrentUser, getStoredAuth, refreshToken, clearStoredAuth } from "@/lib/auth";
import type { AuthUser } from "@/lib/auth";
import Icon from "@/components/ui/icon";

interface Props {
  children: React.ReactNode;
  roles?: AuthUser["role"][];
}

type Status = "checking" | "ok" | "redirect";

export default function RequireAuth({ children, roles }: Props) {
  const [status, setStatus] = useState<Status>("checking");
  const location = useLocation();

  useEffect(() => {
    async function check() {
      const stored = getStoredAuth();

      if (!stored) {
        setStatus("redirect");
        return;
      }

      // Try to validate JWT locally (just check presence)
      // If expired try refresh
      const user = getCurrentUser();
      if (!user) {
        clearStoredAuth();
        setStatus("redirect");
        return;
      }

      // If role restriction is set
      if (roles && roles.length > 0 && !roles.includes(user.role)) {
        clearStoredAuth();
        setStatus("redirect");
        return;
      }

      // Try token refresh in background (if token might be old — just keep going)
      setStatus("ok");

      // Background refresh attempt
      try {
        await refreshToken();
      } catch {
        // ignore
      }
    }
    check();
  }, [location.pathname]);

  if (status === "checking") {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "hsl(var(--background))" }}>
        <Icon name="Loader2" size={24} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (status === "redirect") {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}
