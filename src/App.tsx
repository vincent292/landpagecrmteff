import { lazy, Suspense, type ComponentType } from "react";

import { Navigate, Route, Routes } from "react-router-dom";

import { ProtectedRoute } from "./components/platform/ProtectedRoute";
import { ScrollToTop } from "./components/common/ScrollToTop";
import { AdminLayout } from "./layouts/AdminLayout";
import { PatientLayout } from "./layouts/PatientLayout";
import { PublicLayout } from "./layouts/PublicLayout";

type AdminModule =
  | "tratamientos"
  | "promociones"
  | "cursos"
  | "inscripciones"
  | "solicitudes"
  | "agenda"
  | "disponibilidad"
  | "galeria"
  | "usuarios";

const lazyPage = <P extends object = Record<string, never>>(
  loader: () => Promise<unknown>,
  exportName: string
) =>
  lazy(async () => {
    const module = (await loader()) as Record<string, ComponentType<P>>;
    return { default: module[exportName] };
  });

const AdminCollectionPage = lazyPage<{ module: AdminModule }>(() => import("./pages/admin/AdminCollectionPage"), "AdminCollectionPage");
const AdminDashboard = lazyPage(() => import("./pages/admin/AdminDashboard"), "AdminDashboard");
const AvailabilityAdminPage = lazyPage(() => import("./pages/admin/AvailabilityAdminPage"), "AvailabilityAdminPage");
const BookOrdersAdminPage = lazyPage(() => import("./pages/admin/BookOrdersAdminPage"), "BookOrdersAdminPage");
const BookTokensAdminPage = lazyPage(() => import("./pages/admin/BookTokensAdminPage"), "BookTokensAdminPage");
const BooksAdminPage = lazyPage(() => import("./pages/admin/BooksAdminPage"), "BooksAdminPage");
const PatientAppointmentsAdminPage = lazyPage(() => import("./pages/admin/PatientAppointmentsAdminPage"), "PatientAppointmentsAdminPage");
const PatientCaresAdminPage = lazyPage(() => import("./pages/admin/PatientCaresAdminPage"), "PatientCaresAdminPage");
const PatientClinicalHistoryPage = lazyPage(() => import("./pages/admin/PatientClinicalHistoryPage"), "PatientClinicalHistoryPage");
const PatientDetailPage = lazyPage(() => import("./pages/admin/PatientDetailPage"), "PatientDetailPage");
const PatientPhotosPage = lazyPage(() => import("./pages/admin/PatientPhotosPage"), "PatientPhotosPage");
const PatientPrescriptionsAdminPage = lazyPage(() => import("./pages/admin/PatientPrescriptionsAdminPage"), "PatientPrescriptionsAdminPage");
const PatientsPage = lazyPage(() => import("./pages/admin/PatientsPage"), "PatientsPage");
const ReservationsAdminPage = lazyPage(() => import("./pages/admin/ReservationsAdminPage"), "ReservationsAdminPage");
const BookingPage = lazyPage(() => import("./pages/BookingPage"), "BookingPage");
const HomePage = lazyPage(() => import("./pages/HomePage"), "HomePage");
const PatientAppointmentsPage = lazyPage(() => import("./pages/patient/PatientAppointmentsPage"), "PatientAppointmentsPage");
const PatientBooksPage = lazyPage(() => import("./pages/patient/PatientBooksPage"), "PatientBooksPage");
const PatientCaresPage = lazyPage(() => import("./pages/patient/PatientCaresPage"), "PatientCaresPage");
const PatientDashboardPage = lazyPage(() => import("./pages/patient/PatientDashboardPage"), "PatientDashboardPage");
const PatientDownloadsPage = lazyPage(() => import("./pages/patient/PatientDownloadsPage"), "PatientDownloadsPage");
const PatientPrescriptionsPage = lazyPage(() => import("./pages/patient/PatientPrescriptionsPage"), "PatientPrescriptionsPage");
const PatientProfilePage = lazyPage(() => import("./pages/patient/PatientProfilePage"), "PatientProfilePage");
const ReserveAppointmentPage = lazyPage<{ publicView?: boolean }>(() => import("./pages/patient/ReserveAppointmentPage"), "ReserveAppointmentPage");
const PatientTreatmentsPage = lazyPage(() => import("./pages/patient/PatientTreatmentsPage"), "PatientTreatmentsPage");
const BookDetailPage = lazyPage(() => import("./pages/public/BookDetailPage"), "BookDetailPage");
const BooksPage = lazyPage(() => import("./pages/public/BooksPage"), "BooksPage");
const BuyBookPage = lazyPage(() => import("./pages/public/BuyBookPage"), "BuyBookPage");
const AgendaPage = lazyPage(() => import("./pages/platform/AgendaPage"), "AgendaPage");
const LoginPage = lazyPage(() => import("./pages/platform/AuthPages"), "LoginPage");
const RegisterPage = lazyPage(() => import("./pages/platform/AuthPages"), "RegisterPage");
const ContactPage = lazyPage(() => import("./pages/platform/ContactPage"), "ContactPage");
const CourseDetailPage = lazyPage(() => import("./pages/platform/CourseDetailPage"), "CourseDetailPage");
const CoursesPage = lazyPage(() => import("./pages/platform/CoursesPage"), "CoursesPage");
const GalleryDetailPage = lazyPage(() => import("./pages/platform/GalleryDetailPage"), "GalleryDetailPage");
const GalleryPage = lazyPage(() => import("./pages/platform/GalleryPage"), "GalleryPage");
const PromotionsPage = lazyPage(() => import("./pages/platform/PromotionsPage"), "PromotionsPage");
const TreatmentDetailPage = lazyPage(() => import("./pages/platform/TreatmentDetailPage"), "TreatmentDetailPage");
const TreatmentsPage = lazyPage(() => import("./pages/platform/TreatmentsPage"), "TreatmentsPage");

export default function App() {
  return (
    <Suspense fallback={null}>
      <ScrollToTop />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/agendar" element={<BookingPage />} />

      <Route element={<PublicLayout />}>
        <Route path="/tratamientos" element={<TreatmentsPage />} />
        <Route path="/tratamientos/:slug" element={<TreatmentDetailPage />} />
        <Route path="/promociones" element={<PromotionsPage />} />
        <Route path="/cursos" element={<CoursesPage />} />
        <Route path="/cursos/:slug" element={<CourseDetailPage />} />
        <Route path="/libros" element={<BooksPage />} />
        <Route path="/libros/:slug" element={<BookDetailPage />} />
        <Route path="/comprar-libro/:slug" element={<BuyBookPage />} />
        <Route path="/reservar-cita" element={<ReserveAppointmentPage publicView />} />
        <Route path="/agenda" element={<AgendaPage />} />
        <Route path="/galeria" element={<GalleryPage />} />
        <Route path="/galeria/:slug" element={<GalleryDetailPage />} />
        <Route path="/sobre-la-doctora" element={<Navigate to="/#doctora" replace />} />
        <Route path="/contacto" element={<ContactPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
      </Route>

      <Route element={<ProtectedRoute requireStaff />}>
        <Route path="/panel" element={<AdminLayout />}>
          <Route index element={<AdminDashboard />} />
          <Route path="pacientes" element={<PatientsPage />} />
          <Route path="pacientes/:id" element={<PatientDetailPage />} />
          <Route path="pacientes/:id/historia-clinica" element={<PatientClinicalHistoryPage />} />
          <Route path="pacientes/:id/fotos" element={<PatientPhotosPage />} />
          <Route path="pacientes/:id/citas" element={<PatientAppointmentsAdminPage />} />
          <Route path="pacientes/:id/recetas" element={<PatientPrescriptionsAdminPage />} />
          <Route path="pacientes/:id/cuidados" element={<PatientCaresAdminPage />} />
          <Route path="tratamientos" element={<AdminCollectionPage module="tratamientos" />} />
          <Route path="promociones" element={<AdminCollectionPage module="promociones" />} />
          <Route path="cursos" element={<AdminCollectionPage module="cursos" />} />
          <Route path="inscripciones" element={<AdminCollectionPage module="inscripciones" />} />
          <Route path="solicitudes" element={<AdminCollectionPage module="solicitudes" />} />
          <Route path="agenda" element={<AdminCollectionPage module="agenda" />} />
          <Route path="disponibilidad" element={<AvailabilityAdminPage />} />
          <Route path="citas" element={<ReservationsAdminPage />} />
          <Route path="libros" element={<BooksAdminPage />} />
          <Route path="libros/nuevo" element={<BooksAdminPage />} />
          <Route path="libros/:id/editar" element={<BooksAdminPage />} />
          <Route path="pedidos-libros" element={<BookOrdersAdminPage />} />
          <Route path="tokens-libros" element={<BookTokensAdminPage />} />
          <Route path="galeria" element={<AdminCollectionPage module="galeria" />} />
          <Route path="usuarios" element={<AdminCollectionPage module="usuarios" />} />
        </Route>
      </Route>

      <Route element={<ProtectedRoute requirePortal />}>
        <Route path="/mi-panel" element={<PatientLayout />}>
          <Route index element={<PatientDashboardPage />} />
          <Route path="perfil" element={<PatientProfilePage />} />
          <Route path="citas" element={<PatientAppointmentsPage />} />
          <Route path="reservar-cita" element={<ReserveAppointmentPage />} />
          <Route path="cuidados" element={<PatientCaresPage />} />
          <Route path="recetas" element={<PatientPrescriptionsPage />} />
          <Route path="tratamientos" element={<PatientTreatmentsPage />} />
          <Route path="libros" element={<PatientBooksPage />} />
          <Route path="descargas" element={<PatientDownloadsPage />} />
        </Route>
      </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
