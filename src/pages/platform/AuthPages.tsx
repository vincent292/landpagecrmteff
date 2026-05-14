import { useState } from "react";
import { ArrowRight, LockKeyhole, ShieldCheck, UserRoundPlus } from "lucide-react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { z } from "zod";

import { BrandSignature } from "../../components/common/BrandSignature";
import { useAuth } from "../../hooks/useAuth";
import { supabase } from "../../lib/supabaseClient";
import { isPortalRole, isStaffRole, normalizeRole } from "../../lib/roles";

const authSchema = z.object({
  email: z.string().email("Escribe un email valido"),
  password: z.string().min(6, "Minimo 6 caracteres"),
  fullName: z.string().optional(),
  phone: z.string().optional(),
  city: z.string().optional(),
});

type Values = z.infer<typeof authSchema>;

export function LoginPage() {
  return <AuthForm mode="login" />;
}

export function RegisterPage() {
  return <AuthForm mode="register" />;
}

function AuthForm({ mode }: { mode: "login" | "register" }) {
  const { signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(authSchema) });

  const from = (location.state as { from?: string } | null)?.from;
  const isLogin = mode === "login";

  const getDashboardPath = (role: ReturnType<typeof normalizeRole>) => (isStaffRole(role) ? "/panel" : "/mi-panel");

  const getSafeRedirectPath = (role: ReturnType<typeof normalizeRole>) => {
    const dashboardPath = getDashboardPath(role);
    if (!from) return dashboardPath;
    if (from.startsWith("/panel") && isStaffRole(role)) return from;
    if (from.startsWith("/mi-panel") && isPortalRole(role)) return from;
    if (!from.startsWith("/panel") && !from.startsWith("/mi-panel")) return from;
    return dashboardPath;
  };

  const onSubmit = async (values: Values) => {
    setError("");
    setMessage("");
    try {
      if (isLogin) {
        await signIn(values.email, values.password);
        const { data: auth } = await supabase.auth.getUser();
        const { data: profile } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", auth.user?.id ?? "")
          .maybeSingle();
        const role = normalizeRole(profile?.role);
        navigate(getSafeRedirectPath(role), { replace: true });
      } else {
        const result = await signUp(values.email, values.password, values.fullName ?? "", {
          phone: values.phone,
          city: values.city,
          role: "patient",
        });

        if (result.alreadyRegistered) {
          setError("Ese correo ya está registrado. Inicia sesión o usa la recuperación de acceso.");
          return;
        }

        if (result.needsEmailConfirmation) {
          setMessage("Cuenta creada. Revisa tu correo y confirma tu email antes de iniciar sesión.");
          return;
        }

        navigate(getSafeRedirectPath("patient"), { replace: true });
      }
    } catch (submitError) {
      const errorMessage = submitError instanceof Error ? submitError.message : "";
      setError(getAuthErrorMessage(errorMessage));
    }
  };

  return (
    <section className="relative overflow-hidden px-6 py-14 md:px-8 md:py-20">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_16%_18%,rgba(198,162,123,0.16),transparent_28%),radial-gradient(circle_at_82%_18%,rgba(111,122,96,0.10),transparent_26%),linear-gradient(180deg,#fbf7f2_0%,#f4ebe1_100%)]" />
      <div className="relative mx-auto grid min-h-[78vh] max-w-7xl gap-8 lg:grid-cols-[0.92fr_1.08fr] lg:items-center">
        <div className="rounded-[36px] border border-[rgba(198,162,123,0.18)] bg-[rgba(255,249,244,0.66)] p-6 shadow-[0_24px_80px_rgba(62,42,31,0.10)] backdrop-blur-2xl md:p-8">
          <BrandSignature
            subtitle="Estetica medica"
            textClassName="text-[1.8rem] sm:text-[2rem]"
            subtitleClassName="tracking-[0.18em]"
          />

          <div className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-white/60 px-4 py-2 text-xs font-semibold uppercase tracking-[0.24em] text-[var(--color-accent-strong)]">
            {isLogin ? <LockKeyhole className="h-4 w-4" /> : <UserRoundPlus className="h-4 w-4" />}
            {isLogin ? "Acceso privado" : "Registro"}
          </div>

          <h1 className="font-display mt-5 text-5xl font-semibold leading-[0.92] text-[var(--color-ink)] md:text-6xl">
            {isLogin ? "Bienvenida a tu espacio seguro" : "Estas a un paso de comenzar tu proceso"}
          </h1>

          <p className="mt-5 max-w-xl text-sm leading-7 text-[var(--color-copy)] md:text-base">
            {isLogin
              ? "Ingresa a tu portal para consultar tus citas, cuidados, recetas, cursos y libros adquiridos."
              : "Crea tu cuenta para recibir seguimiento, acceder a tus cuidados, reservar citas, inscribirte a cursos y guardar tus libros."}
          </p>

          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            <InfoPill icon={<ShieldCheck className="h-4 w-4" />} text="Acceso protegido" />
            <InfoPill icon={<ArrowRight className="h-4 w-4" />} text="Gestión clara de tu proceso" />
          </div>
        </div>

        <form
          onSubmit={handleSubmit(onSubmit)}
          className="w-full rounded-[36px] border border-[var(--color-border)] bg-[rgba(255,249,244,0.88)] p-6 shadow-[0_28px_90px_rgba(62,42,31,0.12)] backdrop-blur-2xl md:p-8"
        >
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--color-accent-strong)]">
            {isLogin ? "Iniciar sesion" : "Crear cuenta"}
          </p>
          <h2 className="font-display mt-3 text-4xl font-semibold text-[var(--color-ink)] md:text-5xl">
            {isLogin ? "Ingresa a tu portal" : "Completa tus datos"}
          </h2>

          {!isLogin ? (
            <div className="mt-8 grid gap-5 md:grid-cols-2">
              <label className="block md:col-span-2">
                <span className="text-sm font-semibold text-[var(--color-ink)]">Nombre completo</span>
                <input {...register("fullName")} className="premium-input mt-2" />
              </label>
              <label className="block">
                <span className="text-sm font-semibold text-[var(--color-ink)]">Celular</span>
                <input {...register("phone")} className="premium-input mt-2" />
              </label>
              <label className="block">
                <span className="text-sm font-semibold text-[var(--color-ink)]">Ciudad</span>
                <input {...register("city")} className="premium-input mt-2" />
              </label>
            </div>
          ) : null}

          <label className="mt-5 block">
            <span className="text-sm font-semibold text-[var(--color-ink)]">Email</span>
            <input
              type="email"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              inputMode="email"
              {...register("email")}
              className="premium-input mt-2"
            />
            {errors.email ? <span className="mt-1 block text-sm text-red-700">{errors.email.message}</span> : null}
          </label>

          <label className="mt-5 block">
            <span className="text-sm font-semibold text-[var(--color-ink)]">Contraseña</span>
            <input
              type="password"
              autoComplete={isLogin ? "current-password" : "new-password"}
              {...register("password")}
              className="premium-input mt-2"
            />
            {errors.password ? <span className="mt-1 block text-sm text-red-700">{errors.password.message}</span> : null}
          </label>

          {error ? <p className="mt-4 rounded-2xl bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
          {message ? <p className="mt-4 rounded-2xl bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p> : null}

          <button
            disabled={isSubmitting}
            className="mt-8 inline-flex w-full items-center justify-center gap-2 rounded-full bg-[var(--color-mocha)] px-6 py-3.5 text-sm font-semibold text-white shadow-[0_18px_42px_rgba(62,42,31,0.18)]"
          >
            {isSubmitting ? "Procesando..." : isLogin ? "Ingresar a mi portal" : "Crear mi cuenta"}
            <ArrowRight className="h-4 w-4" />
          </button>

          <p className="mt-5 text-center text-sm text-[var(--color-copy)]">
            {isLogin ? "¿Aún no tienes cuenta?" : "¿Ya tienes cuenta?"}{" "}
            <Link to={isLogin ? "/register" : "/login"} className="font-semibold text-[var(--color-mocha)]">
              {isLogin ? "Crea tu cuenta" : "Inicia sesión"}
            </Link>
          </p>
          <p className="mt-3 text-center text-sm text-[var(--color-copy)]">
            <Link to="/" className="font-medium text-[var(--color-copy)] transition hover:text-[var(--color-ink)]">
              Volver al inicio
            </Link>
          </p>
        </form>
      </div>
    </section>
  );
}

function InfoPill({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex items-center gap-2 rounded-full border border-[rgba(198,162,123,0.18)] bg-white/60 px-4 py-3 text-sm text-[var(--color-copy)]">
      <span className="text-[var(--color-mocha)]">{icon}</span>
      <span>{text}</span>
    </div>
  );
}

function getAuthErrorMessage(message: string) {
  const normalized = message.toLowerCase();

  if (normalized.includes("email not confirmed")) {
    return "Tu correo todavía no está confirmado. Revisa tu email o solicita apoyo al equipo.";
  }

  if (normalized.includes("invalid login credentials")) {
    return "Correo o contraseña incorrectos.";
  }

  if (normalized.includes("user already registered") || normalized.includes("already registered")) {
    return "Ese correo ya está registrado. Inicia sesión o recupera tu acceso.";
  }

  if (normalized.includes("signup is disabled")) {
    return "El registro de usuarios está desactivado temporalmente.";
  }

  if (normalized.includes("rate limit")) {
    return "Se alcanzó el límite temporal de intentos. Espera unos minutos y vuelve a intentar.";
  }

  return message || "No pudimos completar el acceso. Revisa tus datos e intenta otra vez.";
}
