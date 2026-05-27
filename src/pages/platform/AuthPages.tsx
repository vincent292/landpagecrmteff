import { useEffect, useState, type ReactNode } from "react";
import { ArrowRight, KeyRound, LockKeyhole, Mail, ShieldCheck, UserRoundPlus } from "lucide-react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { z } from "zod";

import { BrandSignature } from "../../components/common/BrandSignature";
import { boliviaCities } from "../../data/cities";
import { useAuth } from "../../hooks/useAuth";
import { supabase } from "../../lib/supabaseClient";
import { isPortalRole, isStaffRole, normalizeRole } from "../../lib/roles";
import { normalizeDocumentNumber } from "../../utils/documentNumber";

const loginSchema = z.object({
  email: z.string().email("Escribe un email valido"),
  password: z.string().min(6, "Minimo 6 caracteres"),
});

const registerSchema = loginSchema.extend({
  fullName: z.string().min(3, "Escribe tu nombre completo"),
  phone: z.string().min(7, "Escribe tu celular"),
  city: z.string().min(2, "Selecciona tu ciudad"),
  documentNumber: z.string().min(5, "Escribe tu numero de carnet"),
});

const forgotPasswordSchema = z.object({
  email: z.string().email("Escribe un email valido"),
});

const resetPasswordSchema = z
  .object({
    password: z.string().min(8, "La nueva contrasena debe tener al menos 8 caracteres"),
    confirmPassword: z.string().min(8, "Confirma tu nueva contrasena"),
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: "Las contrasenas no coinciden",
    path: ["confirmPassword"],
  });

type LoginValues = z.infer<typeof loginSchema>;
type RegisterValues = z.infer<typeof registerSchema>;
type ForgotPasswordValues = z.infer<typeof forgotPasswordSchema>;
type ResetPasswordValues = z.infer<typeof resetPasswordSchema>;

export function LoginPage() {
  return <AuthForm mode="login" />;
}

export function RegisterPage() {
  return <AuthForm mode="register" />;
}

export function ForgotPasswordPage() {
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordValues>({
    resolver: zodResolver(forgotPasswordSchema),
  });

  const onSubmit = async (values: ForgotPasswordValues) => {
    setError("");
    setMessage("");

    try {
      const redirectTo = `${window.location.origin}/restablecer-contrasena`;
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(values.email.trim().toLowerCase(), {
        redirectTo,
      });

      if (resetError) throw resetError;

      setMessage(
        "Si el correo esta registrado, te enviaremos un enlace temporal para restablecer tu contrasena. Revisa tu bandeja y tambien spam."
      );
    } catch (submitError) {
      const errorMessage = submitError instanceof Error ? submitError.message : "";
      setError(getAuthErrorMessage(errorMessage));
    }
  };

  return (
    <AuthShell
      eyebrow="Recuperacion de acceso"
      title="Recupera tu contrasena"
      description="Ingresa tu correo y te enviaremos un enlace temporal para que vuelvas a entrar a tu portal de la clinica."
      icon={<Mail className="h-4 w-4" />}
      sideTitle="Tu acceso sigue protegido"
      sideCopy="El enlace de recuperacion te lleva a una pagina privada para definir una nueva contrasena y retomar tu seguimiento clinico."
      footer={
        <p className="mt-5 text-center text-sm text-[var(--color-copy)]">
          <Link to="/login" className="font-semibold text-[var(--color-mocha)]">
            Volver al inicio de sesion
          </Link>
        </p>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} className="w-full rounded-[36px] border border-[var(--color-border)] bg-[rgba(255,249,244,0.88)] p-6 shadow-[0_28px_90px_rgba(62,42,31,0.12)] backdrop-blur-2xl md:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--color-accent-strong)]">Recuperar contrasena</p>
        <h2 className="font-display mt-3 text-4xl font-semibold text-[var(--color-ink)] md:text-5xl">
          Te enviaremos un enlace temporal
        </h2>

        <label className="mt-8 block">
          <span className="text-sm font-semibold text-[var(--color-ink)]">Email</span>
          <input
            type="email"
            autoComplete="email"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            inputMode="email"
            {...register("email")}
            className="premium-input mt-2"
          />
          {errors.email ? <span className="mt-1 block text-sm text-red-700">{errors.email.message}</span> : null}
        </label>

        {error ? <p className="mt-4 rounded-2xl bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
        {message ? <p className="mt-4 rounded-2xl bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p> : null}

        <button
          disabled={isSubmitting}
          className="mt-8 inline-flex w-full items-center justify-center gap-2 rounded-full bg-[var(--color-mocha)] px-6 py-3.5 text-sm font-semibold text-white shadow-[0_18px_42px_rgba(62,42,31,0.18)] disabled:opacity-60"
        >
          {isSubmitting ? "Enviando enlace..." : "Enviar enlace de recuperacion"}
          <ArrowRight className="h-4 w-4" />
        </button>
      </form>
    </AuthShell>
  );
}

export function ResetPasswordPage() {
  const { session, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordValues>({
    resolver: zodResolver(resetPasswordSchema),
  });

  useEffect(() => {
    let active = true;

    const bootstrap = async () => {
      const { data } = await supabase.auth.getSession();
      if (!active) return;
      setReady(Boolean(data.session));
      setChecking(false);
    };

    void bootstrap();

    const { data: listener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!active) return;
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
        setReady(Boolean(nextSession));
        setChecking(false);
      }
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const onSubmit = async (values: ResetPasswordValues) => {
    setError("");
    setMessage("");

    try {
      const { error: updateError } = await supabase.auth.updateUser({ password: values.password });
      if (updateError) throw updateError;

      await refreshProfile();

      const { data: auth } = await supabase.auth.getUser();
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", auth.user?.id ?? "")
        .maybeSingle();
      const role = normalizeRole(profile?.role);
      const nextPath = isStaffRole(role) ? "/panel" : "/mi-panel";

      setMessage("Tu contrasena fue actualizada correctamente. Te llevaremos a tu portal.");
      window.setTimeout(() => navigate(nextPath, { replace: true }), 1000);
    } catch (submitError) {
      const errorMessage = submitError instanceof Error ? submitError.message : "";
      setError(getAuthErrorMessage(errorMessage));
    }
  };

  if (checking) {
    return (
      <section className="relative overflow-hidden px-6 py-14 md:px-8 md:py-20">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_16%_18%,rgba(198,162,123,0.16),transparent_28%),radial-gradient(circle_at_82%_18%,rgba(111,122,96,0.10),transparent_26%),linear-gradient(180deg,#fbf7f2_0%,#f4ebe1_100%)]" />
        <div className="relative mx-auto flex min-h-[70vh] max-w-4xl items-center justify-center rounded-[36px] border border-[var(--color-border)] bg-[rgba(255,249,244,0.88)] p-8 text-center shadow-[0_28px_90px_rgba(62,42,31,0.12)] backdrop-blur-2xl">
          <p className="text-sm leading-7 text-[var(--color-copy)]">Validando tu enlace de recuperacion...</p>
        </div>
      </section>
    );
  }

  if (!ready && !session) {
    return (
      <AuthShell
        eyebrow="Enlace no disponible"
        title="Este acceso ya no esta activo"
        description="El enlace pudo expirar o ya no es valido. Solicita uno nuevo para volver a recuperar tu contrasena."
        icon={<KeyRound className="h-4 w-4" />}
        sideTitle="Seguridad del portal"
        sideCopy="Por seguridad, los enlaces de recuperacion son temporales y solo deben usarse desde tu correo."
        footer={
          <p className="mt-5 text-center text-sm text-[var(--color-copy)]">
            <Link to="/recuperar-contrasena" className="font-semibold text-[var(--color-mocha)]">
              Solicitar un nuevo enlace
            </Link>
          </p>
        }
      >
        <div className="w-full rounded-[36px] border border-[var(--color-border)] bg-[rgba(255,249,244,0.88)] p-6 shadow-[0_28px_90px_rgba(62,42,31,0.12)] backdrop-blur-2xl md:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--color-accent-strong)]">Recuperacion caducada</p>
          <h2 className="font-display mt-3 text-4xl font-semibold text-[var(--color-ink)] md:text-5xl">
            Vuelve a solicitar el acceso
          </h2>
          <p className="mt-5 text-sm leading-7 text-[var(--color-copy)]">
            Te enviaremos un nuevo enlace temporal para que restablezcas tu contrasena sin perder la seguridad de tu cuenta.
          </p>
          <div className="mt-8">
            <Link to="/recuperar-contrasena" className="inline-flex items-center gap-2 rounded-full bg-[var(--color-mocha)] px-6 py-3 text-sm font-semibold text-white">
              Pedir nuevo enlace
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      eyebrow="Restablecer acceso"
      title="Define tu nueva contrasena"
      description="Estas dentro del proceso seguro de recuperacion. Crea una nueva contrasena para volver a entrar a tu portal clinico."
      icon={<KeyRound className="h-4 w-4" />}
      sideTitle="Clinica Dra. Estefany"
      sideCopy="Una vez guardada tu nueva contrasena, entraras de nuevo a tu dashboard para seguir con tus citas, cuidados, recetas, cursos y libros."
      footer={
        <p className="mt-5 text-center text-sm text-[var(--color-copy)]">
          <Link to="/login" className="font-semibold text-[var(--color-mocha)]">
            Volver al inicio de sesion
          </Link>
        </p>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} className="w-full rounded-[36px] border border-[var(--color-border)] bg-[rgba(255,249,244,0.88)] p-6 shadow-[0_28px_90px_rgba(62,42,31,0.12)] backdrop-blur-2xl md:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--color-accent-strong)]">Nueva contrasena</p>
        <h2 className="font-display mt-3 text-4xl font-semibold text-[var(--color-ink)] md:text-5xl">
          Tu portal esta casi listo
        </h2>

        <label className="mt-8 block">
          <span className="text-sm font-semibold text-[var(--color-ink)]">Nueva contrasena</span>
          <input
            type="password"
            autoComplete="new-password"
            {...register("password")}
            className="premium-input mt-2"
          />
          {errors.password ? <span className="mt-1 block text-sm text-red-700">{errors.password.message}</span> : null}
        </label>

        <label className="mt-5 block">
          <span className="text-sm font-semibold text-[var(--color-ink)]">Confirmar contrasena</span>
          <input
            type="password"
            autoComplete="new-password"
            {...register("confirmPassword")}
            className="premium-input mt-2"
          />
          {errors.confirmPassword ? <span className="mt-1 block text-sm text-red-700">{errors.confirmPassword.message}</span> : null}
        </label>

        {error ? <p className="mt-4 rounded-2xl bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
        {message ? <p className="mt-4 rounded-2xl bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p> : null}

        <button
          disabled={isSubmitting}
          className="mt-8 inline-flex w-full items-center justify-center gap-2 rounded-full bg-[var(--color-mocha)] px-6 py-3.5 text-sm font-semibold text-white shadow-[0_18px_42px_rgba(62,42,31,0.18)] disabled:opacity-60"
        >
          {isSubmitting ? "Guardando..." : "Guardar nueva contrasena"}
          <ArrowRight className="h-4 w-4" />
        </button>
      </form>
    </AuthShell>
  );
}

function AuthForm({ mode }: { mode: "login" | "register" }) {
  const { signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const isLogin = mode === "login";
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues | RegisterValues>({
    resolver: zodResolver(isLogin ? loginSchema : registerSchema),
  });

  const from = (location.state as { from?: string } | null)?.from;

  const getDashboardPath = (role: ReturnType<typeof normalizeRole>) => (isStaffRole(role) ? "/panel" : "/mi-panel");

  const getSafeRedirectPath = (role: ReturnType<typeof normalizeRole>) => {
    const dashboardPath = getDashboardPath(role);
    if (!from) return dashboardPath;
    if (from.startsWith("/panel") && isStaffRole(role)) return from;
    if (from.startsWith("/mi-panel") && isPortalRole(role)) return from;
    if (!from.startsWith("/panel") && !from.startsWith("/mi-panel")) return from;
    return dashboardPath;
  };

  const onSubmit = async (values: LoginValues | RegisterValues) => {
    setError("");
    setMessage("");
    try {
      if (isLogin) {
        const loginValues = values as LoginValues;
        await signIn(loginValues.email, loginValues.password);
        const { data: auth } = await supabase.auth.getUser();
        const { data: profile } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", auth.user?.id ?? "")
          .maybeSingle();
        const role = normalizeRole(profile?.role);
        navigate(getSafeRedirectPath(role), { replace: true });
      } else {
        const registerValues = values as RegisterValues;
        const result = await signUp(registerValues.email, registerValues.password, registerValues.fullName, {
          phone: registerValues.phone,
          city: registerValues.city,
          documentNumber: normalizeDocumentNumber(registerValues.documentNumber),
          role: "patient",
        });

        if (result.alreadyRegistered) {
          setError("Ese correo ya esta registrado. Inicia sesion o usa la recuperacion de acceso.");
          return;
        }

        if (result.needsEmailConfirmation) {
          setMessage("Cuenta creada. Revisa tu correo y confirma tu email antes de iniciar sesion.");
          return;
        }

        const { data: auth } = await supabase.auth.getUser();
        const { data: createdProfile } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", auth.user?.id ?? "")
          .maybeSingle();
        const role = normalizeRole(createdProfile?.role);
        navigate(getSafeRedirectPath(role), { replace: true });
      }
    } catch (submitError) {
      const errorMessage = submitError instanceof Error ? submitError.message : "";
      setError(getAuthErrorMessage(errorMessage));
    }
  };

  return (
    <AuthShell
      eyebrow={isLogin ? "Acceso privado" : "Registro"}
      title={isLogin ? "Bienvenida a tu espacio seguro" : "Estas a un paso de comenzar tu proceso"}
      description={
        isLogin
          ? "Ingresa a tu portal para consultar tus citas, cuidados, recetas, cursos y libros adquiridos."
          : "Crea tu cuenta para recibir seguimiento, acceder a tus cuidados, reservar citas, inscribirte a cursos y guardar tus libros."
      }
      icon={isLogin ? <LockKeyhole className="h-4 w-4" /> : <UserRoundPlus className="h-4 w-4" />}
      sideTitle="Clinica Dra. Estefany"
      sideCopy="Un acceso privado y protegido para que cada paciente y cada doctora entren a su plataforma con contexto y continuidad."
      footer={
        <>
          <p className="mt-5 text-center text-sm text-[var(--color-copy)]">
            {isLogin ? "Aun no tienes cuenta?" : "Ya tienes cuenta?"}{" "}
            <Link to={isLogin ? "/register" : "/login"} className="font-semibold text-[var(--color-mocha)]">
              {isLogin ? "Crea tu cuenta" : "Inicia sesion"}
            </Link>
          </p>
          {isLogin ? (
            <p className="mt-3 text-center text-sm text-[var(--color-copy)]">
              <Link to="/recuperar-contrasena" className="font-medium text-[var(--color-mocha)] transition hover:text-[var(--color-ink)]">
                Olvide mi contrasena
              </Link>
            </p>
          ) : null}
          <p className="mt-3 text-center text-sm text-[var(--color-copy)]">
            <Link to="/" className="font-medium text-[var(--color-copy)] transition hover:text-[var(--color-ink)]">
              Volver al inicio
            </Link>
          </p>
        </>
      }
    >
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
              <input {...register("fullName" as never)} className="premium-input mt-2" />
              {"fullName" in errors ? <span className="mt-1 block text-sm text-red-700">{errors.fullName?.message as string | undefined}</span> : null}
            </label>
            <label className="block">
              <span className="text-sm font-semibold text-[var(--color-ink)]">Celular</span>
              <input {...register("phone" as never)} className="premium-input mt-2" />
              {"phone" in errors ? <span className="mt-1 block text-sm text-red-700">{errors.phone?.message as string | undefined}</span> : null}
            </label>
            <label className="block">
              <span className="text-sm font-semibold text-[var(--color-ink)]">Ciudad</span>
              <select {...register("city" as never)} className="premium-input mt-2">
                <option value="">Selecciona ciudad</option>
                {boliviaCities.map((city) => (
                  <option key={city} value={city}>
                    {city}
                  </option>
                ))}
              </select>
              {"city" in errors ? <span className="mt-1 block text-sm text-red-700">{errors.city?.message as string | undefined}</span> : null}
            </label>
            <label className="block">
              <span className="text-sm font-semibold text-[var(--color-ink)]">Numero de carnet</span>
              <input
                {...register("documentNumber" as never)}
                onChange={(event) => {
                  event.target.value = normalizeDocumentNumber(event.target.value);
                }}
                className="premium-input mt-2"
              />
              {"documentNumber" in errors ? <span className="mt-1 block text-sm text-red-700">{errors.documentNumber?.message as string | undefined}</span> : null}
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
          {errors.email ? <span className="mt-1 block text-sm text-red-700">{errors.email.message as string | undefined}</span> : null}
        </label>

        <label className="mt-5 block">
          <span className="text-sm font-semibold text-[var(--color-ink)]">Contrasena</span>
          <input
            type="password"
            autoComplete={isLogin ? "current-password" : "new-password"}
            {...register("password")}
            className="premium-input mt-2"
          />
          {errors.password ? <span className="mt-1 block text-sm text-red-700">{errors.password.message as string | undefined}</span> : null}
        </label>

        {error ? <p className="mt-4 rounded-2xl bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
        {message ? <p className="mt-4 rounded-2xl bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p> : null}

        <button
          disabled={isSubmitting}
          className="mt-8 inline-flex w-full items-center justify-center gap-2 rounded-full bg-[var(--color-mocha)] px-6 py-3.5 text-sm font-semibold text-white shadow-[0_18px_42px_rgba(62,42,31,0.18)] disabled:opacity-60"
        >
          {isSubmitting ? "Procesando..." : isLogin ? "Ingresar a mi portal" : "Crear mi cuenta"}
          <ArrowRight className="h-4 w-4" />
        </button>
      </form>
    </AuthShell>
  );
}

function AuthShell({
  eyebrow,
  title,
  description,
  icon,
  sideTitle,
  sideCopy,
  children,
  footer,
}: {
  eyebrow: string;
  title: string;
  description: string;
  icon: ReactNode;
  sideTitle: string;
  sideCopy: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
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
            {icon}
            {eyebrow}
          </div>

          <h1 className="font-display mt-5 text-5xl font-semibold leading-[0.92] text-[var(--color-ink)] md:text-6xl">
            {title}
          </h1>

          <p className="mt-5 max-w-xl text-sm leading-7 text-[var(--color-copy)] md:text-base">
            {description}
          </p>

          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            <InfoPill icon={<ShieldCheck className="h-4 w-4" />} text="Acceso protegido" />
            <InfoPill icon={<ArrowRight className="h-4 w-4" />} text={sideTitle} />
          </div>

          <p className="mt-6 max-w-xl text-sm leading-7 text-[var(--color-copy)]">
            {sideCopy}
          </p>
        </div>

        <div>
          {children}
          {footer}
        </div>
      </div>
    </section>
  );
}

function InfoPill({ icon, text }: { icon: ReactNode; text: string }) {
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
    return "Tu correo todavia no esta confirmado. Revisa tu email o solicita apoyo al equipo.";
  }

  if (normalized.includes("invalid login credentials")) {
    return "Correo o contrasena incorrectos.";
  }

  if (normalized.includes("user already registered") || normalized.includes("already registered")) {
    return "Ese correo ya esta registrado. Inicia sesion o recupera tu acceso.";
  }

  if (
    normalized.includes("numero de carnet ya esta vinculado") ||
    normalized.includes("numero de carnet ya fue reclamado") ||
    normalized.includes("carnet ya esta vinculado") ||
    normalized.includes("carnet ya fue reclamado")
  ) {
    return "Ese carnet ya esta vinculado a otra cuenta. Verifica el dato o solicita apoyo a administracion.";
  }

  if (normalized.includes("signup is disabled")) {
    return "El registro de usuarios esta desactivado temporalmente.";
  }

  if (normalized.includes("rate limit")) {
    return "Se alcanzo el limite temporal de intentos. Espera unos minutos y vuelve a intentar.";
  }

  if (normalized.includes("same password")) {
    return "Elige una contrasena distinta a la anterior.";
  }

  return message || "No pudimos completar el acceso. Revisa tus datos e intenta otra vez.";
}
