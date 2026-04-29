import { Link } from "react-router-dom";

export function AccessDeniedPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[linear-gradient(180deg,#fbf7f2_0%,#f4ebe1_100%)] px-6">
      <div className="max-w-xl rounded-[32px] border border-[var(--color-border)] bg-white/75 p-8 text-center shadow-[0_24px_80px_rgba(62,42,31,0.10)] md:p-10">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--color-accent-strong)]">
          Acceso denegado
        </p>
        <h1 className="font-display mt-4 text-5xl font-semibold leading-[0.94] text-[var(--color-ink)]">
          Esta area esta reservada para otro tipo de perfil.
        </h1>
        <p className="mt-5 text-sm leading-7 text-[var(--color-copy)] md:text-base">
          La informacion clinica, administrativa y privada se muestra segun los permisos de tu cuenta para proteger la experiencia de pacientes y equipo medico.
        </p>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <Link to="/" className="rounded-full border border-[var(--color-border)] px-6 py-3 text-sm font-semibold text-[var(--color-ink)]">
            Volver al inicio
          </Link>
          <Link to="/login" className="rounded-full bg-[var(--color-mocha)] px-6 py-3 text-sm font-semibold text-white">
            Cambiar de cuenta
          </Link>
        </div>
      </div>
    </div>
  );
}
