import { useEffect, useState, type ReactNode } from "react";
import { ArrowRight, Eye, EyeOff, KeyRound, LockKeyhole, Mail, ShieldCheck, UserRoundPlus } from "lucide-react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { z } from "zod";

import { BrandSignature } from "../../components/common/BrandSignature";
import { LoadingState } from "../../components/common/AsyncState";
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
    password: z.string().min(8, "La nueva contraseña debe tener al menos 8 caracteres"),
    confirmPassword: z.string().min(8, "Confirma tu nueva contraseña"),
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: "Las contraseñas no coinciden",
    path: ["confirmPassword"],
  });

type LoginValues = z.infer<typeof loginSchema>;
type RegisterValues = z.infer<typeof registerSchema>;
type ForgotPasswordValues = z.infer<typeof forgotPasswordSchema>;
type ResetPasswordValues = z.infer<typeof resetPasswordSchema>;

const oauthNextStorageKey = "dra_estefany_oauth_next";
const oauthModeStorageKey = "dra_estefany_oauth_mode";
type OAuthFlowMode = "signin" | "link";

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
        "Si el correo está registrado, te enviaremos un enlace temporal para restablecer tu contraseña. Revisa tu bandeja y también spam."
      );
    } catch (submitError) {
      const errorMessage = submitError instanceof Error ? submitError.message : "";
      setError(getAuthErrorMessage(errorMessage));
    }
  };

  return (
    <AuthShell
      eyebrow="Recuperación de acceso"
      title="Recupera tu contraseña"
      description="Ingresa tu correo y te enviaremos un enlace temporal para que vuelvas a entrar a tu portal de la clínica."
      icon={<Mail className="h-4 w-4" />}
      sideTitle="Tu acceso sigue protegido"
      sideCopy="El enlace de recuperación te lleva a una página privada para definir una nueva contraseña y retomar tu seguimiento clínico."
      footer={
        <p className="mt-5 text-center text-sm text-[var(--color-copy)]">
          <Link to="/login" className="font-semibold text-[var(--color-mocha)]">
            Volver al inicio de sesión
          </Link>
        </p>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} className="w-full rounded-[36px] border border-[var(--color-border)] bg-[rgba(255,249,244,0.88)] p-6 shadow-[0_28px_90px_rgba(62,42,31,0.12)] backdrop-blur-2xl md:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--color-accent-strong)]">Recuperar contraseña</p>
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
          {isSubmitting ? "Enviando enlace..." : "Enviar enlace de recuperación"}
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

      setMessage("Tu contraseña fue actualizada correctamente. Te llevaremos a tu portal.");
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
          <p className="text-sm leading-7 text-[var(--color-copy)]">Validando tu enlace de recuperación...</p>
        </div>
      </section>
    );
  }

  if (!ready && !session) {
    return (
      <AuthShell
        eyebrow="Enlace no disponible"
        title="Este acceso ya no esta activo"
        description="El enlace pudo expirar o ya no es válido. Solicita uno nuevo para volver a recuperar tu contraseña."
        icon={<KeyRound className="h-4 w-4" />}
        sideTitle="Seguridad del portal"
        sideCopy="Por seguridad, los enlaces de recuperación son temporales y solo deben usarse desde tu correo."
        footer={
          <p className="mt-5 text-center text-sm text-[var(--color-copy)]">
            <Link to="/recuperar-contrasena" className="font-semibold text-[var(--color-mocha)]">
              Solicitar un nuevo enlace
            </Link>
          </p>
        }
      >
        <div className="w-full rounded-[36px] border border-[var(--color-border)] bg-[rgba(255,249,244,0.88)] p-6 shadow-[0_28px_90px_rgba(62,42,31,0.12)] backdrop-blur-2xl md:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--color-accent-strong)]">Recuperación caducada</p>
          <h2 className="font-display mt-3 text-4xl font-semibold text-[var(--color-ink)] md:text-5xl">
            Vuelve a solicitar el acceso
          </h2>
          <p className="mt-5 text-sm leading-7 text-[var(--color-copy)]">
            Te enviaremos un nuevo enlace temporal para que restablezcas tu contraseña sin perder la seguridad de tu cuenta.
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
      title="Define tu nueva contraseña"
      description="Estás dentro del proceso seguro de recuperación. Crea una nueva contraseña para volver a entrar a tu portal clínico."
      icon={<KeyRound className="h-4 w-4" />}
      sideTitle="Clinica Dra. Estefany"
      sideCopy="Una vez guardada tu nueva contraseña, entrarás de nuevo a tu dashboard para seguir con tus citas, cuidados, recetas, cursos y libros."
      footer={
        <p className="mt-5 text-center text-sm text-[var(--color-copy)]">
          <Link to="/login" className="font-semibold text-[var(--color-mocha)]">
            Volver al inicio de sesión
          </Link>
        </p>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} className="w-full rounded-[36px] border border-[var(--color-border)] bg-[rgba(255,249,244,0.88)] p-6 shadow-[0_28px_90px_rgba(62,42,31,0.12)] backdrop-blur-2xl md:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--color-accent-strong)]">Nueva contraseña</p>
        <h2 className="font-display mt-3 text-4xl font-semibold text-[var(--color-ink)] md:text-5xl">
          Tu portal esta casi listo
        </h2>

        <label className="mt-8 block">
          <span className="text-sm font-semibold text-[var(--color-ink)]">Nueva contraseña</span>
          <input
            type="password"
            autoComplete="new-password"
            {...register("password")}
            className="premium-input mt-2"
          />
          {errors.password ? <span className="mt-1 block text-sm text-red-700">{errors.password.message}</span> : null}
        </label>

        <label className="mt-5 block">
          <span className="text-sm font-semibold text-[var(--color-ink)]">Confirmar contraseña</span>
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
          {isSubmitting ? "Guardando..." : "Guardar nueva contraseña"}
          <ArrowRight className="h-4 w-4" />
        </button>
      </form>
    </AuthShell>
  );
}

export function AuthCallbackPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { refreshProfile } = useAuth();
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    const finishOAuth = async () => {
      let requestedPath: string | null = null;
      let flowMode: OAuthFlowMode = "signin";

      try {
        const searchParams = new URLSearchParams(location.search);
        const hashParams = new URLSearchParams(location.hash.replace(/^#/, ""));
        flowMode = getOAuthFlowMode(searchParams);
        requestedPath = takeOAuthNextPath();
        const providerError = searchParams.get("error_description") || hashParams.get("error_description") || searchParams.get("error") || hashParams.get("error");
        if (providerError) throw new Error(providerError);

        const code = searchParams.get("code");
        if (code) {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
          if (exchangeError) throw exchangeError;
        }

        const { data, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;
        if (!data.session?.user.id) throw new Error("No pudimos completar el ingreso con Google.");

        const role = await getRoleWithRetry(data.session.user.id);
        await refreshProfile();

        if (!active) return;
        const safePath = getSafeRedirectPath(role, requestedPath);
        navigate(flowMode === "link" ? appendOAuthResult(safePath, { linked: true }) : safePath, { replace: true });
      } catch (callbackError) {
        if (!active) return;
        const message = callbackError instanceof Error ? callbackError.message : "";
        if (flowMode === "link") {
          const fallbackPath = isSafeRelativePath(requestedPath) ? requestedPath : "/mi-panel/perfil";
          navigate(appendOAuthResult(fallbackPath, { error: getAuthErrorMessage(message) }), { replace: true });
          return;
        }
        setError(getAuthErrorMessage(message));
      }
    };

    void finishOAuth();

    return () => {
      active = false;
    };
  }, [location.hash, location.search, navigate, refreshProfile]);

  if (error) {
    return (
      <AuthShell
        eyebrow="Acceso con Google"
        title="No pudimos completar el ingreso"
        description="Google devolvio una respuesta, pero el acceso no quedo activo. Puedes volver a intentarlo o entrar con tu correo y contrasena."
        icon={<Mail className="h-4 w-4" />}
        sideTitle="Acceso protegido"
        sideCopy="El portal mantiene el mismo control de roles: pacientes entran a su panel y el equipo autorizado entra al panel administrativo."
        footer={
          <p className="mt-5 text-center text-sm text-[var(--color-copy)]">
            <Link to="/login" className="font-semibold text-[var(--color-mocha)]">
              Volver al inicio de sesion
            </Link>
          </p>
        }
      >
        <div className="w-full rounded-[36px] border border-[var(--color-border)] bg-[rgba(255,249,244,0.88)] p-6 shadow-[0_28px_90px_rgba(62,42,31,0.12)] backdrop-blur-2xl md:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--color-accent-strong)]">Google</p>
          <h2 className="font-display mt-3 text-4xl font-semibold text-[var(--color-ink)] md:text-5xl">
            Revisa la configuracion
          </h2>
          <p className="mt-5 rounded-2xl bg-red-50 p-4 text-sm leading-6 text-red-700">{error}</p>
        </div>
      </AuthShell>
    );
  }

  return <LoadingState label="Completando ingreso con Google..." />;
}

function AuthForm({ mode }: { mode: "login" | "register" }) {
  const { signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const isLogin = mode === "login";
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues | RegisterValues>({
    resolver: zodResolver(isLogin ? loginSchema : registerSchema),
  });

  const from = (location.state as { from?: string } | null)?.from;

  const onGoogleSignIn = async () => {
    setError("");
    setMessage("");
    setGoogleLoading(true);
    try {
      saveOAuthNextPath(from, "signin");
      const { error: googleError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          queryParams: {
            prompt: "select_account",
          },
        },
      });
      if (googleError) throw googleError;
    } catch (submitError) {
      const errorMessage = submitError instanceof Error ? submitError.message : "";
      setError(getAuthErrorMessage(errorMessage));
      setGoogleLoading(false);
    }
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
          .eq("is_deleted", false)
          .maybeSingle();
        const role = normalizeRole(profile?.role);
        navigate(getSafeRedirectPath(role, from), { replace: true });
      } else {
        const registerValues = values as RegisterValues;
        const result = await signUp(registerValues.email, registerValues.password, registerValues.fullName, {
          phone: registerValues.phone,
          city: registerValues.city,
          documentNumber: normalizeDocumentNumber(registerValues.documentNumber),
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

        const { data: auth } = await supabase.auth.getUser();
        const { data: createdProfile } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", auth.user?.id ?? "")
          .eq("is_deleted", false)
          .maybeSingle();
        const role = normalizeRole(createdProfile?.role);
        navigate(getSafeRedirectPath(role, from), { replace: true });
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
              {isLogin ? "Crea tu cuenta" : "Inicia sesión"}
            </Link>
          </p>
          {isLogin ? (
            <p className="mt-3 text-center text-sm text-[var(--color-copy)]">
              <Link to="/recuperar-contrasena" className="font-medium text-[var(--color-mocha)] transition hover:text-[var(--color-ink)]">
                Olvidé mi contraseña
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
          {isLogin ? "Iniciar sesión" : "Crear cuenta"}
        </p>
        <h2 className="font-display mt-3 text-4xl font-semibold text-[var(--color-ink)] md:text-5xl">
          {isLogin ? "Ingresa a tu portal" : "Completa tus datos"}
        </h2>

        <GoogleAuthButton
          label={isLogin ? "Continuar con Google" : "Registrarme con Google"}
          loading={googleLoading}
          disabled={isSubmitting}
          onClick={() => void onGoogleSignIn()}
        />

        <div className="my-6 flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-copy)]">
          <span className="h-px flex-1 bg-[var(--color-border)]" />
          <span>{isLogin ? "o ingresa con email" : "o crea tu cuenta con email"}</span>
          <span className="h-px flex-1 bg-[var(--color-border)]" />
        </div>

        {!isLogin ? (
          <div className="grid gap-5 md:grid-cols-2">
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
          <div className="relative mt-2">
            <input
              type={showPassword ? "text" : "password"}
              autoComplete={isLogin ? "current-password" : "new-password"}
              {...register("password")}
              className="premium-input pr-12"
            />
            <button
              type="button"
              onClick={() => setShowPassword((current) => !current)}
              className="absolute right-3 top-1/2 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-[var(--color-copy)] transition hover:bg-[rgba(216,194,174,0.22)] hover:text-[var(--color-ink)]"
              aria-label={showPassword ? "Ocultar contrasena" : "Mostrar contrasena"}
              title={showPassword ? "Ocultar contrasena" : "Mostrar contrasena"}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
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

function GoogleAuthButton({
  label,
  loading,
  disabled,
  onClick,
}: {
  label: string;
  loading: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      className="mt-7 inline-flex w-full items-center justify-center gap-3 rounded-full border border-[var(--color-border)] bg-white px-6 py-3.5 text-sm font-semibold text-[var(--color-ink)] shadow-[0_12px_28px_rgba(62,42,31,0.08)] transition hover:border-[var(--color-mocha)] hover:bg-[#fffaf5] disabled:cursor-not-allowed disabled:opacity-60"
    >
      <span className="grid h-5 w-5 place-items-center rounded-full bg-white text-base font-bold leading-none text-[#4285f4] shadow-sm">G</span>
      {loading ? "Conectando con Google..." : label}
    </button>
  );
}

function getDashboardPath(role: ReturnType<typeof normalizeRole>) {
  return isStaffRole(role) ? "/panel" : "/mi-panel";
}

function getSafeRedirectPath(role: ReturnType<typeof normalizeRole>, requestedPath?: string | null) {
  const dashboardPath = getDashboardPath(role);
  if (!isSafeRelativePath(requestedPath)) return dashboardPath;
  if (requestedPath.startsWith("/panel") && isStaffRole(role)) return requestedPath;
  if (requestedPath.startsWith("/mi-panel") && isPortalRole(role)) return requestedPath;
  if (!requestedPath.startsWith("/panel") && !requestedPath.startsWith("/mi-panel")) return requestedPath;
  return dashboardPath;
}

function isSafeRelativePath(value?: string | null): value is string {
  return Boolean(value && value.startsWith("/") && !value.startsWith("//"));
}

function saveOAuthNextPath(value?: string | null, mode: OAuthFlowMode = "signin") {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(oauthModeStorageKey, mode);
    if (isSafeRelativePath(value)) {
      window.sessionStorage.setItem(oauthNextStorageKey, value);
    } else {
      window.sessionStorage.removeItem(oauthNextStorageKey);
    }
  } catch {
    // Storage can be disabled in private browsing modes.
  }
}

function getOAuthFlowMode(searchParams: URLSearchParams): OAuthFlowMode {
  const queryMode = searchParams.get("mode");
  const storedMode = takeOAuthMode();
  return queryMode === "link" || storedMode === "link" ? "link" : "signin";
}

function takeOAuthMode(): OAuthFlowMode | null {
  if (typeof window === "undefined") return null;
  try {
    const value = window.sessionStorage.getItem(oauthModeStorageKey);
    window.sessionStorage.removeItem(oauthModeStorageKey);
    return value === "link" || value === "signin" ? value : null;
  } catch {
    return null;
  }
}

function takeOAuthNextPath() {
  if (typeof window === "undefined") return null;
  try {
    const value = window.sessionStorage.getItem(oauthNextStorageKey);
    window.sessionStorage.removeItem(oauthNextStorageKey);
    return isSafeRelativePath(value) ? value : null;
  } catch {
    return null;
  }
}

function appendOAuthResult(path: string, result: { linked?: boolean; error?: string }) {
  const url = new URL(path, window.location.origin);
  url.searchParams.delete("google_linked");
  url.searchParams.delete("google_link_error");

  if (result.linked) {
    url.searchParams.set("google_linked", "1");
  }

  if (result.error) {
    url.searchParams.set("google_link_error", result.error);
  }

  return `${url.pathname}${url.search}${url.hash}`;
}

async function getRoleWithRetry(userId: string) {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const { data, error } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", userId)
      .eq("is_deleted", false)
      .maybeSingle();

    if (data?.role) return normalizeRole(data.role);
    if (error) lastError = error;
    await new Promise((resolve) => window.setTimeout(resolve, 250));
  }

  if (lastError) throw lastError;

  await supabase.auth.signOut({ scope: "local" });
  throw new Error("Cuenta desactivada. Solicita a un superusuario que la restablezca.");
}

function getAuthErrorMessage(message: string) {
  const normalized = message.toLowerCase();

  if (normalized.includes("email not confirmed")) {
    return "Tu correo todavía no está confirmado. Revisa tu email o solicita apoyo al equipo.";
  }

  if (normalized.includes("invalid login credentials")) {
    return "Correo o contraseña incorrectos.";
  }

  if (normalized.includes("provider is not enabled") || normalized.includes("unsupported provider") || normalized.includes("oauth provider")) {
    return "Google todavia no esta activo en Supabase Auth. Activa el proveedor Google y guarda el Client ID y Client Secret.";
  }

  if (normalized.includes("redirect_uri_mismatch")) {
    return "La URL de retorno de Google no coincide. Agrega el callback de Supabase en Google Cloud.";
  }

  if (normalized.includes("user already registered") || normalized.includes("already registered")) {
    return "Ese correo ya está registrado. Inicia sesión o recupera tu acceso.";
  }

  if (
    normalized.includes("numero de carnet ya esta vinculado") ||
    normalized.includes("numero de carnet ya fue reclamado") ||
    normalized.includes("carnet ya esta vinculado") ||
    normalized.includes("carnet ya fue reclamado")
  ) {
    return "Ese carnet ya está vinculado a otra cuenta. Verifica el dato o solicita apoyo a administración.";
  }

  if (normalized.includes("signup is disabled")) {
    return "El registro de usuarios esta desactivado temporalmente.";
  }

  if (normalized.includes("rate limit")) {
    return "Se alcanzo el limite temporal de intentos. Espera unos minutos y vuelve a intentar.";
  }

  if (normalized.includes("same password")) {
    return "Elige una contraseña distinta a la anterior.";
  }

  if (normalized.includes("cuenta desactivada")) {
    return "Esta cuenta fue desactivada. Solo un superusuario puede restablecer el acceso.";
  }

  return message || "No pudimos completar el acceso. Revisa tus datos e intenta otra vez.";
}
