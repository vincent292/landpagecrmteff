import { Navigate, Route, Routes } from "react-router-dom";

import { ProtectedRoute } from "./components/platform/ProtectedRoute";
import { AdminLayout } from "./layouts/AdminLayout";
import { PublicLayout } from "./layouts/PublicLayout";
import { AdminCollectionPage } from "./pages/admin/AdminCollectionPage";
import { AdminDashboard } from "./pages/admin/AdminDashboard";
import { BookingPage } from "./pages/BookingPage";
import { HomePage } from "./pages/HomePage";
import { AboutDoctorPage } from "./pages/platform/AboutDoctorPage";
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
        <Route path="/agenda" element={<AgendaPage />} />
        <Route path="/galeria" element={<GalleryPage />} />
        <Route path="/galeria/:slug" element={<GalleryDetailPage />} />
        <Route path="/sobre-la-doctora" element={<AboutDoctorPage />} />
        <Route path="/contacto" element={<ContactPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
      </Route>
      <Route element={<ProtectedRoute requireStaff />}>
        <Route path="/panel" element={<AdminLayout />}>
          <Route index element={<AdminDashboard />} />
          <Route path="tratamientos" element={<AdminCollectionPage module="tratamientos" />} />
          <Route path="promociones" element={<AdminCollectionPage module="promociones" />} />
          <Route path="cursos" element={<AdminCollectionPage module="cursos" />} />
          <Route path="inscripciones" element={<AdminCollectionPage module="inscripciones" />} />
          <Route path="solicitudes" element={<AdminCollectionPage module="solicitudes" />} />
          <Route path="agenda" element={<AdminCollectionPage module="agenda" />} />
          <Route path="galeria" element={<AdminCollectionPage module="galeria" />} />
          <Route path="usuarios" element={<AdminCollectionPage module="usuarios" />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
