import { Link } from "react-router-dom";

import { PublicAssessmentBookingFlow } from "../../components/platform/PublicAssessmentBookingFlow";

export function ReserveAppointmentPage({ publicView = false }: { publicView?: boolean }) {
  return (
    <section className={publicView ? "mx-auto max-w-6xl px-4 py-12 sm:px-6 md:px-8 md:py-24" : "space-y-6"}>
      {!publicView ? (
        <div className="rounded-[28px] border border-[var(--color-border)] bg-white/75 p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--color-accent-strong)]">
            Reserva privada
          </p>
          <h1 className="font-display mt-3 text-5xl font-semibold">Agenda tu cita con pago y comprobante</h1>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-[var(--color-copy)]">
            Usa el mismo flujo del landing, pero ahora dentro de tu portal. Eliges para que cita quieres agendarte, la doctora, el horario real, pagas por QR, subes tu comprobante y luego revisas el estado desde Mis citas.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link to="/mi-panel/citas" className="rounded-full border border-[var(--color-border)] px-5 py-3 text-sm font-semibold">
              Ver mis citas
            </Link>
            <Link to="/mi-panel/perfil" className="rounded-full border border-[var(--color-border)] px-5 py-3 text-sm font-semibold">
              Completar perfil
            </Link>
          </div>
        </div>
      ) : null}

      <PublicAssessmentBookingFlow
        mode="page"
        allowDoctorSelection
        allowAppointmentTypeSelection
        appointmentTypeOptions={[
          "Valoracion estetica",
          "Consulta general",
          "Control",
          "Procedimiento",
          "Revision postratamiento",
        ]}
        context={{
          type: "general",
          title: "Reserva tu cita privada con horario real, pago por QR y comprobante dentro del portal del paciente.",
        }}
      />
    </section>
  );
}
