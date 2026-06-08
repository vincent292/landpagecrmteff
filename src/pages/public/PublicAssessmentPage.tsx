import { Seo } from "../../components/common/Seo";
import { PublicAssessmentBookingFlow } from "../../components/platform/PublicAssessmentBookingFlow";

export function PublicAssessmentPage() {
  return (
    <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 md:px-8 md:py-24">
      <Seo
        title="Reservar valoracion de medicina estetica | Dra. Estefany Ballesteros"
        description="Reserva una valoracion de medicina estetica con agenda, pago y comprobante en un solo flujo para pacientes en Bolivia."
        path="/reservar-cita"
        image="/doctora/dra1.jpg"
        keywords={["reservar valoracion medicina estetica", "consulta medicina estetica Bolivia", "agenda doctora estetica Bolivia"]}
      />
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
