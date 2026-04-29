import { Navigate, Route, Routes } from "react-router-dom";

import { ProtectedRoute } from "./components/platform/ProtectedRoute";
import { AdminLayout } from "./layouts/AdminLayout";
import { PatientLayout } from "./layouts/PatientLayout";
import { PublicLayout } from "./layouts/PublicLayout";
import { AdminCollectionPage } from "./pages/admin/AdminCollectionPage";
import { AdminDashboard } from "./pages/admin/AdminDashboard";
import { AvailabilityAdminPage } from "./pages/admin/AvailabilityAdminPage";
import { BookOrdersAdminPage } from "./pages/admin/BookOrdersAdminPage";
import { BookTokensAdminPage } from "./pages/admin/BookTokensAdminPage";
import { BooksAdminPage } from "./pages/admin/BooksAdminPage";
import { PatientAppointmentsAdminPage } from "./pages/admin/PatientAppointmentsAdminPage";
import { PatientCaresAdminPage } from "./pages/admin/PatientCaresAdminPage";
import { PatientClinicalHistoryPage } from "./pages/admin/PatientClinicalHistoryPage";
import { PatientDetailPage } from "./pages/admin/PatientDetailPage";
import { PatientPhotosPage } from "./pages/admin/PatientPhotosPage";
import { PatientPrescriptionsAdminPage } from "./pages/admin/PatientPrescriptionsAdminPage";
import { PatientsPage } from "./pages/admin/PatientsPage";
import { ReservationsAdminPage } from "./pages/admin/ReservationsAdminPage";
import { BookingPage } from "./pages/BookingPage";
import { HomePage } from "./pages/HomePage";
import { PatientAppointmentsPage } from "./pages/patient/PatientAppointmentsPage";
import { PatientBooksPage } from "./pages/patient/PatientBooksPage";
import { PatientCaresPage } from "./pages/patient/PatientCaresPage";
import { PatientDashboardPage } from "./pages/patient/PatientDashboardPage";
import { PatientDownloadsPage } from "./pages/patient/PatientDownloadsPage";
import { PatientPrescriptionsPage } from "./pages/patient/PatientPrescriptionsPage";
import { PatientProfilePage } from "./pages/patient/PatientProfilePage";
import { ReserveAppointmentPage } from "./pages/patient/ReserveAppointmentPage";
import { PatientTreatmentsPage } from "./pages/patient/PatientTreatmentsPage";
import { BookDetailPage } from "./pages/public/BookDetailPage";
import { BooksPage } from "./pages/public/BooksPage";
import { BuyBookPage } from "./pages/public/BuyBookPage";
import { AgendaPage } from "./pages/platform/AgendaPage";
import { LoginPage, RegisterPage } from "./pages/platform/AuthPages";
import { ContactPage } from "./pages/platform/ContactPage";
import { CourseDetailPage } from "./pages/platform/CourseDetailPage";
import { CoursesPage } from "./pages/platform/CoursesPage";
import { GalleryDetailPage } from "./pages/platform/GalleryDetailPage";
import { GalleryPage } from "./pages/platform/GalleryPage";
import { PromotionsPage } from "./pages/platform/PromotionsPage";
import { TreatmentDetailPage } from "./pages/platform/TreatmentDetailPage";
import { TreatmentsPage } from "./pages/platform/TreatmentsPage";

export default function App() {
  return (
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
  );
}
