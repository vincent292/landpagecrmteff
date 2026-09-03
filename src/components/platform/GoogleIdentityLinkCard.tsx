import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Link2 } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";

import { useAuth } from "../../hooks/useAuth";
import { cn } from "../../lib/cn";
import { supabase } from "../../lib/supabaseClient";

const oauthNextStorageKey = "dra_estefany_oauth_next";
const oauthModeStorageKey = "dra_estefany_oauth_mode";

type GoogleIdentityLinkCardProps = {
  variant?: "card" | "compact";
  className?: string;
};

export function GoogleIdentityLinkCard({ variant = "card", className }: GoogleIdentityLinkCardProps) {
  const { user, refreshProfile } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  const [linking, setLinking] = useState(false);
  const [linkedEmail, setLinkedEmail] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ type: "success" | "error"; text: string } | null>(() => getOAuthNotice(location.search));
  const isCompact = variant === "compact";

  const currentReturnPath = useMemo(() => {
    const params = new URLSearchParams(location.search);
    params.delete("google_linked");
    params.delete("google_link_error");
    const search = params.toString();
    return `${location.pathname}${search ? `?${search}` : ""}${location.hash}`;
  }, [location.hash, location.pathname, location.search]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const linked = params.get("google_linked");
    const error = params.get("google_link_error");

    if (linked || error) {
      params.delete("google_linked");
      params.delete("google_link_error");
      const nextSearch = params.toString();
      navigate(`${location.pathname}${nextSearch ? `?${nextSearch}` : ""}${location.hash}`, { replace: true });
    }
  }, [location.hash, location.pathname, location.search, navigate]);

  useEffect(() => {
    let active = true;

    const loadIdentities = async () => {
      if (!user?.id) {
        setChecking(false);
        return;
      }

      setChecking(true);
      const { data, error } = await supabase.auth.getUserIdentities();
      if (!active) return;

      if (error) {
        setNotice({ type: "error", text: getGoogleLinkErrorMessage(error.message) });
        setLinkedEmail(null);
      } else {
        const googleIdentity = data.identities.find((identity) => identity.provider === "google");
        setLinkedEmail(googleIdentity ? getIdentityEmail(googleIdentity.identity_data, user.email) : null);
      }

      setChecking(false);
    };

    void loadIdentities();

    return () => {
      active = false;
    };
  }, [user?.email, user?.id]);

  const linkGoogle = async () => {
    setNotice(null);
    setLinking(true);

    try {
      saveOAuthReturn(currentReturnPath, "link");
      const { error } = await supabase.auth.linkIdentity({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback?mode=link`,
          queryParams: {
            prompt: "select_account",
          },
        },
      });

      if (error) throw error;
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      setNotice({ type: "error", text: getGoogleLinkErrorMessage(message) });
      setLinking(false);
    }
  };

  const refreshStatus = async () => {
    setChecking(true);
    setNotice(null);
    try {
      const { data, error } = await supabase.auth.getUserIdentities();
      if (error) throw error;
      const googleIdentity = data.identities.find((identity) => identity.provider === "google");
      setLinkedEmail(googleIdentity ? getIdentityEmail(googleIdentity.identity_data, user?.email ?? null) : null);
      await refreshProfile();
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      setNotice({ type: "error", text: getGoogleLinkErrorMessage(message) });
    } finally {
      setChecking(false);
    }
  };

  if (!user) return null;

  if (isCompact) {
    return (
      <div className={cn("rounded-[22px] border border-[var(--color-border)] bg-white/60 p-3", className)}>
        <div className="flex items-center gap-2 text-xs font-semibold text-[var(--color-ink)]">
          {linkedEmail ? <CheckCircle2 className="h-4 w-4 text-emerald-700" /> : <Link2 className="h-4 w-4 text-[var(--color-mocha)]" />}
          <span>{linkedEmail ? "Google conectado" : "Conectar Google"}</span>
        </div>
        <p className="mt-1 truncate text-[11px] text-[var(--color-copy)]">
          {checking ? "Verificando..." : linkedEmail ? linkedEmail : "Entra luego con un clic."}
        </p>
        {notice ? <p className={cn("mt-2 text-[11px]", notice.type === "error" ? "text-red-700" : "text-emerald-700")}>{notice.text}</p> : null}
        {!linkedEmail ? (
          <button
            type="button"
            onClick={() => void linkGoogle()}
            disabled={checking || linking}
            className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-full bg-[var(--color-mocha)] px-4 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {linking ? "Conectando..." : "Vincular con Google"}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void refreshStatus()}
            disabled={checking}
            className="mt-3 inline-flex w-full items-center justify-center rounded-full border border-[var(--color-border)] bg-white/60 px-4 py-2 text-xs font-semibold text-[var(--color-ink)] disabled:opacity-60"
          >
            {checking ? "Verificando..." : "Actualizar estado"}
          </button>
        )}
      </div>
    );
  }

  return (
    <section className={cn("mt-8 rounded-[28px] border border-[var(--color-border)] bg-[rgba(255,249,244,0.8)] p-5", className)}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--color-accent-strong)]">Acceso con Google</p>
          <h2 className="font-display mt-2 text-3xl font-semibold text-[var(--color-ink)]">Vincula tu cuenta</h2>
          <p className="mt-2 text-sm leading-6 text-[var(--color-copy)]">
            {linkedEmail
              ? `Tu cuenta ya esta conectada con Google${linkedEmail ? ` (${linkedEmail})` : ""}.`
              : "Si esta cuenta ya existe con correo y contrasena, puedes conectarla con Google para entrar mas rapido sin crear otra cuenta."}
          </p>
        </div>
        {linkedEmail ? (
          <span className="inline-flex items-center justify-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
            <CheckCircle2 className="h-4 w-4" />
            Google conectado
          </span>
        ) : (
          <button
            type="button"
            onClick={() => void linkGoogle()}
            disabled={checking || linking}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-[var(--color-mocha)] px-5 py-3 text-sm font-semibold text-white shadow-[0_14px_32px_rgba(110,74,47,0.18)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <span className="grid h-5 w-5 place-items-center rounded-full bg-white text-base font-bold leading-none text-[#4285f4]">G</span>
            {linking ? "Conectando..." : checking ? "Verificando..." : "Vincular con Google"}
          </button>
        )}
      </div>

      {notice ? (
        <p
          className={cn(
            "mt-4 flex gap-2 rounded-2xl p-3 text-sm leading-6",
            notice.type === "error" ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-800"
          )}
        >
          {notice.type === "error" ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />}
          <span>{notice.text}</span>
        </p>
      ) : null}
    </section>
  );
}

function saveOAuthReturn(path: string, mode: "link" | "signin") {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(oauthModeStorageKey, mode);
    if (isSafeRelativePath(path)) {
      window.sessionStorage.setItem(oauthNextStorageKey, path);
    } else {
      window.sessionStorage.removeItem(oauthNextStorageKey);
    }
  } catch {
    // Storage can be disabled in private browsing modes.
  }
}

function stringFromUnknown(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function getIdentityEmail(identityData: unknown, fallbackEmail?: string | null) {
  const data = identityData && typeof identityData === "object" ? identityData as Record<string, unknown> : {};
  return stringFromUnknown(data.email) ?? fallbackEmail ?? null;
}

function getOAuthNotice(search: string) {
  const params = new URLSearchParams(search);
  if (params.get("google_linked") === "1") {
    return { type: "success" as const, text: "Google quedo vinculado a tu cuenta. Desde ahora podras ingresar tambien con Google." };
  }

  const error = params.get("google_link_error");
  return error ? { type: "error" as const, text: error } : null;
}

function isSafeRelativePath(value?: string | null): value is string {
  return Boolean(value && value.startsWith("/") && !value.startsWith("//"));
}

function getGoogleLinkErrorMessage(message: string) {
  const normalized = message.toLowerCase();

  if (normalized.includes("manual_linking_disabled") || normalized.includes("manual linking")) {
    return "Falta activar Manual Linking en Supabase Auth para permitir vincular Google a cuentas existentes.";
  }

  if (normalized.includes("identity_already_exists") || normalized.includes("already exists") || normalized.includes("already linked")) {
    return "Esa cuenta de Google ya esta vinculada a esta u otra cuenta. Si necesitas moverla, pide apoyo a administracion.";
  }

  if (normalized.includes("provider is not enabled") || normalized.includes("unsupported provider") || normalized.includes("oauth provider")) {
    return "Google todavia no esta activo en Supabase Auth. Revisa el Client ID y Client Secret del proveedor Google.";
  }

  if (normalized.includes("redirect_uri_mismatch")) {
    return "La URL de retorno no coincide. Agrega https://www.draballesteros.com/auth/callback en Google Cloud y Supabase.";
  }

  if (normalized.includes("session") || normalized.includes("not logged in") || normalized.includes("jwt")) {
    return "Tu sesion expiro. Vuelve a iniciar sesion y luego intenta vincular Google.";
  }

  return message || "No pudimos vincular Google. Intenta nuevamente.";
}
