import { useState } from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { z } from "zod";

import { useAuth } from "../../hooks/useAuth";

const loginSchema = z.object({
  email: z.string().email("Email inválido"),
  password: z.string().min(6, "Mínimo 6 caracteres"),
  fullName: z.string().optional(),
});

type Values = z.infer<typeof loginSchema>;

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
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(loginSchema) });

  const from = (location.state as { from?: string } | null)?.from ?? "/panel";

  const onSubmit = async (values: Values) => {
    setError("");
    try {
      if (mode === "register") {
        await signUp(values.email, values.password, values.fullName ?? "");
      } else {
        await signIn(values.email, values.password);
      }
      navigate(from, { replace: true });
    } catch {
      setError("No pudimos completar el acceso. Revisa tus datos.");
    }
  };

  return (
    <section className="mx-auto flex min-h-[78vh] max-w-xl items-center px-6 py-16">
      <form onSubmit={handleSubmit(onSubmit)} className="w-full rounded-[32px] border border-[var(--color-border)] bg-white/70 p-6 shadow-[0_20px_60px_rgba(110,74,47,0.10)] md:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--color-accent-strong)]">{mode === "login" ? "Acceso" : "Registro"}</p>
        <h1 className="font-display mt-3 text-5xl font-semibold">{mode === "login" ? "Iniciar sesión" : "Crear cuenta"}</h1>
        {mode === "register" && (
          <label className="mt-6 block">
            <span className="text-sm font-semibold">Nombre completo</span>
            <input {...register("fullName")} className="premium-input mt-2" />
          </label>
        )}
        <label className="mt-5 block">
          <span className="text-sm font-semibold">Email</span>
          <input {...register("email")} className="premium-input mt-2" />
          {errors.email && <span className="text-sm text-red-700">{errors.email.message}</span>}
        </label>
        <label className="mt-5 block">
          <span className="text-sm font-semibold">Contraseña</span>
          <input type="password" {...register("password")} className="premium-input mt-2" />
          {errors.password && <span className="text-sm text-red-700">{errors.password.message}</span>}
        </label>
        {error && <p className="mt-4 rounded-2xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <button disabled={isSubmitting} className="mt-6 w-full rounded-full bg-[var(--color-mocha)] px-6 py-3.5 text-sm font-semibold text-white">
          {isSubmitting ? "Procesando..." : mode === "login" ? "Entrar" : "Registrarme"}
        </button>
        <p className="mt-5 text-center text-sm text-[var(--color-copy)]">
          {mode === "login" ? "¿No tienes cuenta?" : "¿Ya tienes cuenta?"}{" "}
          <Link to={mode === "login" ? "/register" : "/login"} className="font-semibold text-[var(--color-mocha)]">
            {mode === "login" ? "Crear cuenta" : "Iniciar sesión"}
          </Link>
        </p>
      </form>
    </section>
  );
}
