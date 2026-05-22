import { PublicAssessmentBookingFlow } from "../../components/platform/PublicAssessmentBookingFlow";

export function PublicAssessmentPage() {
  return (
    <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 md:px-8 md:py-24">
      <PublicAssessmentBookingFlow
        mode="page"
        context={{
          type: "general",
          title: "Reserva una valoracion con agenda, pago y comprobante en un solo flujo.",
        }}
      />
    </section>
  );
}
