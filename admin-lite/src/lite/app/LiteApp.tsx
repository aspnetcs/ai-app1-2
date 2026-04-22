import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ADMIN_AUTH_EXPIRED_EVENT,
  clearAdminToken,
  getAdminToken,
  validateAdminSession,
} from "../../api/http";
import { LoginScreen } from "../../layout/LoginScreen";
import { LoadingBlock } from "../../components/LoadingBlock";
import { LiteShell } from "../layout/LiteShell";
import "../styles/lite.css";

export function LiteApp() {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(() => Boolean(getAdminToken()));
  const [authenticated, setAuthenticated] = useState(() => Boolean(getAdminToken()));

  useEffect(() => {
    const token = getAdminToken();
    if (!token) {
      setAuthenticated(false);
      setChecking(false);
      return;
    }
    let mounted = true;
    validateAdminSession()
      .then(() => {
        if (mounted) setAuthenticated(true);
      })
      .catch(() => {
        if (mounted) {
          clearAdminToken();
          setAuthenticated(false);
        }
      })
      .finally(() => {
        if (mounted) setChecking(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const handleExpired = () => {
      clearAdminToken();
      setAuthenticated(false);
      navigate("/", { replace: true });
    };
    window.addEventListener(ADMIN_AUTH_EXPIRED_EVENT, handleExpired);
    return () => window.removeEventListener(ADMIN_AUTH_EXPIRED_EVENT, handleExpired);
  }, [navigate]);

  const handleLogin = async () => {
    setChecking(true);
    try {
      await validateAdminSession();
      setAuthenticated(true);
    } catch {
      setAuthenticated(false);
      clearAdminToken();
    } finally {
      setChecking(false);
    }
  };

  const handleLogout = () => {
    clearAdminToken();
    setAuthenticated(false);
    navigate("/", { replace: true });
  };

  if (checking) {
    return (
      <div className="admin-loading-screen">
        <LoadingBlock label="正在验证会话..." />
      </div>
    );
  }

  if (!authenticated) {
    return <LoginScreen onLogin={handleLogin} />;
  }

  return <LiteShell onLogout={handleLogout} />;
}
