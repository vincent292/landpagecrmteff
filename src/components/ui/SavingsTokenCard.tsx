import { useState } from "react";

type SavingsTokenCardProps = {
  token: string;
  holderName: string;
  title?: string | null;
  subtitle?: string | null;
  footerLabel?: string | null;
  footerValue?: string | null;
  backLabel?: string | null;
  backValue?: string | null;
  className?: string;
};

export function SavingsTokenCard({
  token,
  holderName,
  title = "Tarjeta de ahorro",
  subtitle = "Clinica estetica",
  footerLabel = "Cuenta vinculada",
  footerValue,
  backLabel = "Seguridad",
  backValue = "Solo funciona en la cuenta y carnet correctos.",
  className = "",
}: SavingsTokenCardProps) {
  const [flipped, setFlipped] = useState(false);

  const tokenChunks = formatTokenForCard(token);
  const nextFooterValue = footerValue?.trim() ? footerValue : holderName;

  return (
    <button
      type="button"
      onClick={() => setFlipped((current) => !current)}
      className={`group w-full text-left [perspective:1600px] ${className}`}
      aria-label="Ver tarjeta de ahorro"
    >
      <div
        className={`relative h-[240px] w-full transition-transform duration-700 [transform-style:preserve-3d] ${flipped ? "[transform:rotateY(180deg)]" : "md:group-hover:[transform:rotateY(180deg)]"}`}
      >
        <div className="absolute inset-0 overflow-hidden rounded-[28px] border border-white/20 bg-[linear-gradient(135deg,#23160f_0%,#5f3a24_38%,#b78654_100%)] p-5 text-white shadow-[0_24px_70px_rgba(43,33,27,0.28)] [backface-visibility:hidden]">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.18),transparent_26%),radial-gradient(circle_at_bottom_left,rgba(255,255,255,0.14),transparent_24%)]" />
          <div className="absolute -right-12 top-10 h-36 w-36 rounded-full border border-white/12 bg-white/8 blur-[1px]" />
          <div className="absolute -left-12 bottom-4 h-28 w-28 rounded-full border border-white/10 bg-white/6" />

          <div className="relative flex h-full flex-col">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-white/70">{subtitle}</p>
                <h3 className="mt-2 font-display text-3xl font-semibold leading-none">{title}</h3>
              </div>
              <img
                src="/doctora/logodra.png"
                alt="Logo Dra."
                className="h-14 w-14 rounded-full border border-white/20 bg-white/10 object-cover p-1 shadow-[0_10px_24px_rgba(0,0,0,0.18)]"
              />
            </div>

            <div className="mt-8 flex items-center justify-between gap-4">
              <div className="h-12 w-16 rounded-[14px] border border-white/20 bg-[linear-gradient(135deg,rgba(255,235,196,0.86),rgba(188,145,83,0.92))] shadow-[inset_0_1px_0_rgba(255,255,255,0.3)]">
                <div className="grid h-full grid-cols-3 gap-[1px] p-[5px]">
                  <span className="rounded-[4px] bg-[#8d6536]/60" />
                  <span className="rounded-[4px] bg-[#8d6536]/55" />
                  <span className="rounded-[4px] bg-[#8d6536]/65" />
                  <span className="rounded-[4px] bg-[#8d6536]/65" />
                  <span className="rounded-[4px] bg-[#8d6536]/55" />
                  <span className="rounded-[4px] bg-[#8d6536]/60" />
                </div>
              </div>
              <div className="flex gap-1 text-white/65">
                <SignalArc />
              </div>
            </div>

            <div className="mt-8">
              <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-white/58">Token unico</p>
              <p className="mt-3 break-all font-mono text-[clamp(0.92rem,2.35vw,1.45rem)] font-semibold leading-tight tracking-[0.2em] text-white">
                {tokenChunks}
              </p>
            </div>

            <div className="mt-auto grid gap-4 pt-6 sm:grid-cols-[1fr_auto] sm:items-end">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-white/58">Titular</p>
                <p className="mt-2 text-sm font-semibold tracking-[0.18em] text-white/92">{normalizeHolderName(holderName)}</p>
              </div>
              <div className="sm:text-right">
                <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-white/58">{footerLabel}</p>
                <p className="mt-2 text-sm font-medium text-white/88">{nextFooterValue}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="absolute inset-0 overflow-hidden rounded-[28px] border border-white/16 bg-[linear-gradient(160deg,#20120d_0%,#5d3721_42%,#9b6b42_100%)] p-5 text-white shadow-[0_24px_70px_rgba(43,33,27,0.28)] [backface-visibility:hidden] [transform:rotateY(180deg)]">
          <div className="absolute left-0 right-0 top-7 h-12 bg-[repeating-linear-gradient(45deg,#17110d,#17110d_12px,#0d0907_12px,#0d0907_24px)]" />

          <div className="relative flex h-full flex-col pt-20">
            <div className="rounded-[18px] border border-white/12 bg-white/10 p-4 backdrop-blur-sm">
              <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-white/58">{backLabel}</p>
              <p className="mt-3 text-sm leading-6 text-white/88">{backValue}</p>
            </div>

            <div className="mt-auto flex items-end justify-between gap-4 pt-5">
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-white/58">Identificacion</p>
                <p className="mt-2 break-all font-mono text-xs leading-6 tracking-[0.16em] text-white/88">{tokenChunks}</p>
              </div>
              <img
                src="/doctora/logodra.png"
                alt="Logo Dra."
                className="h-12 w-12 shrink-0 rounded-full border border-white/20 bg-white/10 object-cover p-1"
              />
            </div>
          </div>
        </div>
      </div>
    </button>
  );
}

function SignalArc() {
  return (
    <svg viewBox="0 0 42 32" className="h-8 w-8">
      <path d="M4 26c4-6 10-10 18-12" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M11 28c3-4.4 7.3-7.4 12.8-9" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M18 29c1.8-2.2 3.8-3.8 6.2-4.8" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

function formatTokenForCard(token: string) {
  const cleaned = token.trim().toUpperCase();
  if (!cleaned) return "AHR-0000-0000-0000";
  return cleaned;
}

function normalizeHolderName(holderName: string) {
  const next = holderName.trim().toUpperCase();
  return next.length > 0 ? next : "PACIENTE";
}
