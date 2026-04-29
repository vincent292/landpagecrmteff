import { useState } from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRight, LockKeyhole, ShieldCheck, Sparkles, UserRoundPlus } from "lucide-react";
import { useForm } from "react-hook-form";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { z } from "zod";

import { BrandSignature } from "../../components/common/BrandSignature";
import { useAuth } from "../../hooks/useAuth";
import { supabase } from "../../lib/supabaseClient";
import { isStaffRole, normalizeRole } from "../../lib/roles";

const authSchema = z.object({
  email: z.string().email("Escribe un email valido"),
  password: z.string().min(6, "Minimo 6 caracteres"),
  fullName: z.string().optional(),
  phone: z.string().optional(),
  city: z.string().optional(),
});

type Values = z.infer<typeof authSchema>;

const localAccess = {
  email: "ariasvincent292@gmail.com",
  password: "vins123456",
};

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
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(authSchema) });

  const from = (location.state as { from?: string } | null)?.from;
  const isLogin = mode === "login";

  const onSubmit = async (values: Values) => {
    setError("");
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
        navigate(from ?? (isStaffRole(role) ? "/panel" : "/mi-panel"), { replace: true });
      } else {
        await signUp(values.email, values.password, values.fullName ?? "", {
          phone: values.phone,
          city: values.city,
          role: "patient",
        });
        navigate(from ?? "/mi-panel", { replace: true });
      }
    } catch {
      setError("No pudimos completar el acceso. Revisa tus datos e intenta otra vez.");
    }
  };

  return (
    <section className="relative overflow-hidden px-6 py-14 md:px-8 md:py-20">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_16%_18%,rgba(198,162,123,0.16),transparent_28%),radial-gradient(circle_at_82%_18%,rgba(111,122,96,0.10),transparent_26%),linear-gradient(180deg,#fbf7f2_0%,#f4ebe1_100%)]" />
      <div className="relative mx-auto grid min-h-[78vh] max-w-7xl gap-8 lg:grid-cols-[0.92fr_1.08fr] lg:items-center">
        <div className="rounded-[36px] border border-[rgba(198,162,123,0.18)] bg-[rgba(255,249,244,0.66)] p-6 shadow-[0_24px_80px_rgba(62,42,31,0.10)] backdrop-blur-2xl md:p-8">
          <BrandSignature
            subtitle="Estetica medica premium"
            textClassName="text-[1.8rem] sm:text-[2rem]"
            subtitleClassName="tracking-[0.18em]"
          />

          <div className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-white/60 px-4 py-2 text-xs font-semibold uppercase tracking-[0.24em] text-[var(--color-accent-strong)]">
            {isLogin ? <LockKeyhole className="h-4 w-4" /> : <UserRoundPlus className="h-4 w-4" />}
            {isLogin ? "Acceso privado" : "Registro"}
          </div>

          <h1 className="font-display mt-5 text-5xl font-semibold leading-[0.92] text-[var(--color-ink)] md:text-6xl">
            {isLogin ? "Ingresa al panel con una experiencia clara y amable." : "Crea tu cuenta y continua tu proceso con calma."}
          </h1>

          <p className="mt-5 max-w-xl text-sm leading-7 text-[var(--color-copy)] md:text-base">
            {isLogin
              ? "El acceso mantiene la misma atmosfera elegante de la pagina: limpio, privado y facil de usar desde celular o escritorio."
              : "El registro esta pensado para sentirse ligero, cercano y ordenado, sin pasos innecesarios."}
          </p>

          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            <InfoPill icon={<ShieldCheck className="h-4 w-4" />} text="Acceso seguro" />
            <InfoPill icon={<Sparkles className="h-4 w-4" />} text="Diseno premium" />
            <InfoPill icon={<ArrowRight className="h-4 w-4" />} text="Flujo simple" />
          </div>

          {isLogin && (
            <div className="mt-8 rounded-[28px] border border-[rgba(198,162,123,0.18)] bg-[rgba(247,242,236,0.82)] p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--color-accent-strong)]">
                Cuenta local lista
              </p>
              <p className="mt-3 text-sm leading-7 text-[var(--color-copy)]">
                Ya deje una cuenta local creada para entrar al panel durante el desarrollo.
              </p>
              <div className="mt-4 rounded-2xl bg-white/70 p-4 text-sm text-[var(--color-ink)]">
                <div>{localAccess.email}</div>
                <div className="mt-1">{localAccess.password}</div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setValue("email", localAccess.email);
                  setValue("password", localAccess.password);
                }}
                className="mt-4 rounded-full border border-[var(--color-border)] bg-white/70 px-4 py-2 text-sm font-semibold text-[var(--color-ink)]"
              >
                Usar acceso local
              </button>
            </div>
          )}
        </div>

        <form
          onSubmit={handleSubmit(onSubmit)}
          className="w-full rounded-[36px] border border-[var(--color-border)] bg-[rgba(255,249,244,0.88)] p-6 shadow-[0_28px_90px_rgba(62,42,31,0.12)] backdrop-blur-2xl md:p-8"
        >
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--color-accent-strong)]">
            {isLogin ? "Iniciar sesion" : "Crear cuenta"}
          </p>
          <h2 className="font-display mt-3 text-4xl font-semibold text-[var(--color-ink)] md:text-5xl">
            {isLogin ? "Bienvenido de nuevo" : "Un registro corto y elegante"}
          </h2>

          {!isLogin && (
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
          )}

          <label className="mt-5 block">
            <span className="text-sm font-semibold text-[var(--color-ink)]">Email</span>
            <input {...register("email")} className="premium-input mt-2" />
            {errors.email && <span className="mt-1 block text-sm text-red-700">{errors.email.message}</span>}
          </label>

          <label className="mt-5 block">
            <span className="text-sm font-semibold text-[var(--color-ink)]">Contrasena</span>
            <input type="password" {...register("password")} className="premium-input mt-2" />
            {errors.password && <span className="mt-1 block text-sm text-red-700">{errors.password.message}</span>}
          </label>

          {error && <p className="mt-4 rounded-2xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}

          <button
            disabled={isSubmitting}
            className="mt-8 inline-flex w-full items-center justify-center gap-2 rounded-full bg-[var(--color-mocha)] px-6 py-3.5 text-sm font-semibold text-white shadow-[0_18px_42px_rgba(62,42,31,0.18)]"
          >
            {isSubmitting ? "Procesando..." : isLogin ? "Entrar al panel" : "Registrarme"}
            <ArrowRight className="h-4 w-4" />
          </button>

          <p className="mt-5 text-center text-sm text-[var(--color-copy)]">
            {isLogin ? "No tienes cuenta?" : "Ya tienes cuenta?"}{" "}
            <Link to={isLogin ? "/register" : "/login"} className="font-semibold text-[var(--color-mocha)]">
              {isLogin ? "Crear cuenta" : "Iniciar sesion"}
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
