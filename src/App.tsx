import { lazy, Suspense, useEffect, type ComponentType } from "react";

import { Navigate, Route, Routes, useParams } from "react-router-dom";

import { ProtectedRoute } from "./components/platform/ProtectedRoute";
import { RouteLoadingScreen } from "./components/common/RouteLoadingScreen";
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

const loadHomePage = () => import("./pages/HomePage");
const loadTreatmentsPage = () => import("./pages/platform/TreatmentsPage");
const loadPromotionsPage = () => import("./pages/platform/PromotionsPage");
const loadCoursesPage = () => import("./pages/platform/CoursesPage");
const loadBooksPage = () => import("./pages/public/BooksPage");
const loadGalleryPage = () => import("./pages/platform/GalleryPage");
const loadDoctorsPage = () => import("./pages/platform/DoctorsPage");
const loadContactPage = () => import("./pages/platform/ContactPage");
const loadAuthPages = () => import("./pages/platform/AuthPages");

const AdminCollectionPage = lazyPage<{ module: AdminModule }>(() => import("./pages/admin/AdminCollectionPage"), "AdminCollectionPage");
const AdminDashboard = lazyPage(() => import("./pages/admin/AdminDashboard"), "AdminDashboard");
const AppointmentsCalendarPage = lazyPage(() => import("./pages/admin/AppointmentsCalendarPage"), "AppointmentsCalendarPage");
const AvailabilityAdminPage = lazyPage(() => import("./pages/admin/AvailabilityAdminPage"), "AvailabilityAdminPage");
const DoctorProfileAdminPage = lazyPage(() => import("./pages/admin/DoctorProfileAdminPage"), "DoctorProfileAdminPage");
const DoctorsAdminPage = lazyPage(() => import("./pages/admin/DoctorsAdminPage"), "DoctorsAdminPage");
const BookTokensAdminPage = lazyPage(() => import("./pages/admin/BookTokensAdminPage"), "BookTokensAdminPage");
const BooksAdminPage = lazyPage(() => import("./pages/admin/BooksAdminPage"), "BooksAdminPage");
const InventoryAdminPage = lazyPage(() => import("./pages/admin/InventoryAdminPage"), "InventoryAdminPage");
const CashAdminPage = lazyPage(() => import("./pages/admin/CashAdminPage"), "CashAdminPage");
const PaymentsAndReservationsAdminPage = lazyPage(() => import("./pages/admin/PaymentsAndReservationsAdminPage"), "PaymentsAndReservationsAdminPage");
const PatientAppointmentsAdminPage = lazyPage(() => import("./pages/admin/PatientAppointmentsAdminPage"), "PatientAppointmentsAdminPage");
const PatientCaresAdminPage = lazyPage(() => import("./pages/admin/PatientCaresAdminPage"), "PatientCaresAdminPage");
const PatientClinicalHistoryPage = lazyPage(() => import("./pages/admin/PatientClinicalHistoryPage"), "PatientClinicalHistoryPage");
const PatientDetailPage = lazyPage(() => import("./pages/admin/PatientDetailPage"), "PatientDetailPage");
const PatientPhotosPage = lazyPage(() => import("./pages/admin/PatientPhotosPage"), "PatientPhotosPage");
const PatientPrescriptionsAdminPage = lazyPage(() => import("./pages/admin/PatientPrescriptionsAdminPage"), "PatientPrescriptionsAdminPage");
const PaymentPlansAdminPage = lazyPage(() => import("./pages/admin/PaymentPlansAdminPage"), "PaymentPlansAdminPage");
const PaymentPlanAdminDetailPage = lazyPage(() => import("./pages/admin/PaymentPlanAdminDetailPage"), "PaymentPlanAdminDetailPage");
const PatientsPage = lazyPage(() => import("./pages/admin/PatientsPage"), "PatientsPage");
const ReservationsAdminPage = lazyPage(() => import("./pages/admin/ReservationsAdminPage"), "ReservationsAdminPage");
const SavingsCardsAdminPage = lazyPage(() => import("./pages/admin/SavingsCardsAdminPage"), "SavingsCardsAdminPage");
const SavingsCardAdminDetailPage = lazyPage(() => import("./pages/admin/SavingsCardAdminDetailPage"), "SavingsCardAdminDetailPage");
const SiteSettingsAdminPage = lazyPage(() => import("./pages/admin/SiteSettingsAdminPage"), "SiteSettingsAdminPage");
const HomePage = lazyPage(loadHomePage, "HomePage");
const PatientAppointmentsPage = lazyPage(() => import("./pages/patient/PatientAppointmentsPage"), "PatientAppointmentsPage");
const PatientBooksPage = lazyPage(() => import("./pages/patient/PatientBooksPage"), "PatientBooksPage");
const PatientCaresPage = lazyPage(() => import("./pages/patient/PatientCaresPage"), "PatientCaresPage");
const PatientCoursesPage = lazyPage(() => import("./pages/patient/PatientCoursesPage"), "PatientCoursesPage");
const PatientDashboardPage = lazyPage(() => import("./pages/patient/PatientDashboardPage"), "PatientDashboardPage");
const PatientDownloadsPage = lazyPage(() => import("./pages/patient/PatientDownloadsPage"), "PatientDownloadsPage");
const PatientPaymentPlansPage = lazyPage(() => import("./pages/patient/PatientPaymentPlansPage"), "PatientPaymentPlansPage");
const PatientPrescriptionsPage = lazyPage(() => import("./pages/patient/PatientPrescriptionsPage"), "PatientPrescriptionsPage");
const PatientPromotionsPage = lazyPage(() => import("./pages/patient/PatientPromotionsPage"), "PatientPromotionsPage");
const PatientProfilePage = lazyPage(() => import("./pages/patient/PatientProfilePage"), "PatientProfilePage");
const PatientSavingsCardsPage = lazyPage(() => import("./pages/patient/PatientSavingsCardsPage"), "PatientSavingsCardsPage");
const ReserveAppointmentPage = lazyPage<{ publicView?: boolean }>(() => import("./pages/patient/ReserveAppointmentPage"), "ReserveAppointmentPage");
const PatientTreatmentsPage = lazyPage(() => import("./pages/patient/PatientTreatmentsPage"), "PatientTreatmentsPage");
const BookDetailPage = lazyPage(() => import("./pages/public/BookDetailPage"), "BookDetailPage");
const BooksPage = lazyPage(loadBooksPage, "BooksPage");
const BuyBookPage = lazyPage(() => import("./pages/public/BuyBookPage"), "BuyBookPage");
const PublicAssessmentPage = lazyPage(() => import("./pages/public/PublicAssessmentPage"), "PublicAssessmentPage");
const PublicManualReservationPaymentPage = lazyPage(() => import("./pages/public/PublicManualReservationPaymentPage"), "PublicManualReservationPaymentPage");
const AgendaPage = lazyPage(() => import("./pages/platform/AgendaPage"), "AgendaPage");
const ForgotPasswordPage = lazyPage(loadAuthPages, "ForgotPasswordPage");
const LoginPage = lazyPage(loadAuthPages, "LoginPage");
const RegisterPage = lazyPage(loadAuthPages, "RegisterPage");
const ResetPasswordPage = lazyPage(loadAuthPages, "ResetPasswordPage");
const ContactPage = lazyPage(loadContactPage, "ContactPage");
const CourseDetailPage = lazyPage(() => import("./pages/platform/CourseDetailPage"), "CourseDetailPage");
const CoursesPage = lazyPage(loadCoursesPage, "CoursesPage");
const GalleryDetailPage = lazyPage(() => import("./pages/platform/GalleryDetailPage"), "GalleryDetailPage");
const GalleryPage = lazyPage(loadGalleryPage, "GalleryPage");
const PromotionDetailPage = lazyPage(() => import("./pages/platform/PromotionDetailPage"), "PromotionDetailPage");
const PromotionsPage = lazyPage(loadPromotionsPage, "PromotionsPage");
const TreatmentDetailPage = lazyPage(() => import("./pages/platform/TreatmentDetailPage"), "TreatmentDetailPage");
const TreatmentsPage = lazyPage(loadTreatmentsPage, "TreatmentsPage");
const DoctorsPage = lazyPage(loadDoctorsPage, "DoctorsPage");

function LegacyCourseDetailRedirect() {
  const { slug } = useParams();
  return <Navigate to={slug ? `/academy/${slug}` : "/academy"} replace />;
}

export default function App() {
  useEffect(() => {
    const preload = () => {
      void loadTreatmentsPage();
      void loadPromotionsPage();
      void loadCoursesPage();
      void loadBooksPage();
      void loadGalleryPage();
      void loadDoctorsPage();
      void loadContactPage();
      void loadAuthPages();
    };

    if (typeof window !== "undefined" && "requestIdleCallback" in window) {
      const idleId = window.requestIdleCallback(preload, { timeout: 1800 });
      return () => window.cancelIdleCallback(idleId);
    }

    const timeoutId = globalThis.setTimeout(preload, 1200);
    return () => globalThis.clearTimeout(timeoutId);
  }, []);

  return (
    <Suspense fallback={<RouteLoadingScreen />}>
      <ScrollToTop />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/agendar" element={<Navigate to="/reservar-cita" replace />} />

      <Route element={<PublicLayout />}>
        <Route path="/tratamientos" element={<TreatmentsPage />} />
        <Route path="/tratamientos/:slug" element={<TreatmentDetailPage />} />
        <Route path="/promociones" element={<PromotionsPage />} />
        <Route path="/promociones/:slug" element={<PromotionDetailPage />} />
        <Route path="/academy" element={<CoursesPage />} />
        <Route path="/academy/:slug" element={<CourseDetailPage />} />
        <Route path="/cursos" element={<Navigate to="/academy" replace />} />
        <Route path="/cursos/:slug" element={<LegacyCourseDetailRedirect />} />
        <Route path="/libros" element={<BooksPage />} />
        <Route path="/libros/:slug" element={<BookDetailPage />} />
        <Route path="/comprar-libro/:slug" element={<BuyBookPage />} />
        <Route path="/reservar-cita" element={<PublicAssessmentPage />} />
        <Route path="/pago-cita/:token" element={<PublicManualReservationPaymentPage />} />
        <Route path="/agenda" element={<AgendaPage />} />
        <Route path="/galeria" element={<GalleryPage />} />
        <Route path="/galeria/:slug" element={<GalleryDetailPage />} />
        <Route path="/doctoras" element={<DoctorsPage />} />
        <Route path="/sobre-la-doctora" element={<Navigate to="/#doctora" replace />} />
        <Route path="/contacto" element={<ContactPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/recuperar-contrasena" element={<ForgotPasswordPage />} />
        <Route path="/restablecer-contrasena" element={<ResetPasswordPage />} />
      </Route>

      <Route element={<ProtectedRoute requireStaff />}>
        <Route path="/panel" element={<AdminLayout />}>
          <Route index element={<AdminDashboard />} />
          <Route path="mi-perfil" element={<DoctorProfileAdminPage />} />
          <Route path="pacientes" element={<PatientsPage />} />
          <Route path="doctoras" element={<DoctorsAdminPage />} />
          <Route path="pacientes/:id" element={<PatientDetailPage />} />
          <Route path="pacientes/:id/historia-clinica" element={<PatientClinicalHistoryPage />} />
          <Route path="pacientes/:id/fotos" element={<PatientPhotosPage />} />
          <Route path="pacientes/:id/citas" element={<PatientAppointmentsAdminPage />} />
          <Route path="pacientes/:id/recetas" element={<PatientPrescriptionsAdminPage />} />
          <Route path="pacientes/:id/cuidados" element={<PatientCaresAdminPage />} />
          <Route path="tratamientos" element={<AdminCollectionPage module="tratamientos" />} />
          <Route path="promociones" element={<AdminCollectionPage module="promociones" />} />
          <Route path="academy" element={<AdminCollectionPage module="cursos" />} />
          <Route path="cursos" element={<Navigate to="/panel/academy" replace />} />
          <Route path="inscripciones" element={<AdminCollectionPage module="inscripciones" />} />
          <Route path="solicitudes" element={<AdminCollectionPage module="solicitudes" />} />
          <Route path="agenda" element={<AdminCollectionPage module="agenda" />} />
          <Route path="calendario-citas" element={<AppointmentsCalendarPage />} />
          <Route path="disponibilidad" element={<AvailabilityAdminPage />} />
          <Route path="citas" element={<ReservationsAdminPage />} />
          <Route path="inventario" element={<InventoryAdminPage />} />
          <Route path="caja" element={<CashAdminPage />} />
          <Route path="pagos-reservas" element={<PaymentsAndReservationsAdminPage />} />
          <Route path="planes-pago" element={<PaymentPlansAdminPage />} />
          <Route path="planes-pago/:id" element={<PaymentPlanAdminDetailPage />} />
          <Route path="tarjetas-ahorro" element={<SavingsCardsAdminPage />} />
          <Route path="tarjetas-ahorro/:id" element={<SavingsCardAdminDetailPage />} />
          <Route path="pedidos-promociones" element={<Navigate to="/panel/pagos-reservas" replace />} />
          <Route path="libros" element={<BooksAdminPage />} />
          <Route path="libros/nuevo" element={<BooksAdminPage />} />
          <Route path="libros/:id/editar" element={<BooksAdminPage />} />
          <Route path="pedidos-libros" element={<Navigate to="/panel/pagos-reservas" replace />} />
          <Route path="tokens-libros" element={<BookTokensAdminPage />} />
          <Route path="galeria" element={<AdminCollectionPage module="galeria" />} />
          <Route path="usuarios" element={<AdminCollectionPage module="usuarios" />} />
          <Route path="configuracion" element={<SiteSettingsAdminPage />} />
        </Route>
      </Route>

      <Route element={<ProtectedRoute requirePortal />}>
        <Route path="/mi-panel" element={<PatientLayout />}>
          <Route index element={<PatientDashboardPage />} />
          <Route path="perfil" element={<PatientProfilePage />} />
          <Route path="citas" element={<PatientAppointmentsPage />} />
          <Route path="academy" element={<PatientCoursesPage />} />
          <Route path="cursos" element={<Navigate to="/mi-panel/academy" replace />} />
          <Route path="promociones" element={<PatientPromotionsPage />} />
          <Route path="planes-pago" element={<PatientPaymentPlansPage />} />
          <Route path="tarjetas-ahorro" element={<PatientSavingsCardsPage />} />
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
