import { useEffect, useState } from "react";

import { Navigate, useNavigate, useParams } from "react-router-dom";

import { EmptyState, ErrorState, LoadingState } from "../../components/common/AsyncState";
import { getCourseBySlug, type CourseRow } from "../../services/courseService";
import { enrollToCourse } from "../../services/enrollmentService";
import { useAuth } from "../../hooks/useAuth";
import { formatMoney, listFromText } from "../../utils/text";

export function CourseDetailPage() {
  const { slug } = useParams();
  const [course, setCourse] = useState<CourseRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const { user } = useAuth();
  const navigate = useNavigate();
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!slug) return;
    getCourseBySlug(slug)
      .then(setCourse)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [slug]);

  if (!slug) return <Navigate to="/cursos" replace />;
  if (loading) return <section className="mx-auto max-w-7xl px-6 py-16"><LoadingState /></section>;
  if (error) return <section className="mx-auto max-w-7xl px-6 py-16"><ErrorState /></section>;
  if (!course) return <section className="mx-auto max-w-7xl px-6 py-16"><EmptyState label="No encontramos este curso." /></section>;

  const enroll = async () => {
    if (!user) {
      navigate("/login", { state: { from: `/cursos/${course.slug}` } });
      return;
    }
    await enrollToCourse({
      course_id: course.id,
      user_id: user.id,
      full_name: user.user_metadata.full_name ?? "",
      phone: "",
      email: user.email ?? "",
      city: "",
      profession: "",
    });
    setMessage("Inscripción registrada. El equipo confirmará tu cupo.");
  };

  return (
    <section>
      <div className="relative min-h-[440px] overflow-hidden">
        <img src={course.cover_image ?? "/doctora/dra3.jpg"} alt={course.title} className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(43,33,27,0.72),rgba(43,33,27,0.24))]" />
        <div className="relative mx-auto flex min-h-[440px] max-w-7xl flex-col justify-end px-6 pb-12 text-white md:px-8">
          <p className="text-xs font-semibold uppercase tracking-[0.28em]">Curso</p>
          <h1 className="font-display mt-4 max-w-4xl text-6xl font-semibold leading-[0.9]">{course.title}</h1>
        </div>
      </div>
      <div className="mx-auto grid max-w-7xl gap-8 px-6 py-14 md:px-8 lg:grid-cols-[1fr_360px]">
        <div className="space-y-8">
          <p className="text-lg leading-8 text-[var(--color-copy)]">{course.description}</p>
          <Block title="Temario" items={listFromText(course.syllabus)} />
          <Block title="Requisitos" items={listFromText(course.requirements)} />
          <Block title="Certificación" items={listFromText(course.certification)} />
        </div>
        <aside className="h-fit rounded-[28px] border border-[var(--color-border)] bg-white/70 p-6 shadow-[0_18px_48px_rgba(110,74,47,0.08)]">
          <p className="text-sm text-[var(--color-copy)]">{course.city} · {course.modality}</p>
          <h2 className="mt-3 text-3xl font-semibold">{formatMoney(course.price)}</h2>
          <p className="mt-4 text-sm leading-7 text-[var(--color-copy)]">{course.start_date} · {course.start_time}<br />{course.available_slots ?? 0} cupos disponibles</p>
          <button onClick={() => void enroll()} className="mt-6 w-full rounded-full bg-[var(--color-caramel)] px-6 py-3.5 text-sm font-semibold text-white">
            Inscribirme
          </button>
          {message && <p className="mt-4 rounded-2xl bg-[rgba(111,122,96,0.10)] p-4 text-sm text-[rgb(72,94,70)]">{message}</p>}
        </aside>
      </div>
    </section>
  );
}

function Block({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-[28px] border border-[var(--color-border)] bg-white/60 p-6">
      <h2 className="text-2xl font-semibold">{title}</h2>
      {items.length ? (
        <ul className="mt-4 space-y-3 text-sm leading-7 text-[var(--color-copy)]">
          {items.map((item) => <li key={item}>• {item}</li>)}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-[var(--color-copy)]">Información en preparación.</p>
      )}
    </div>
  );
}
