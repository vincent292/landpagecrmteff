import { useEffect, useState } from "react";

import { Link } from "react-router-dom";

import { EmptyState, ErrorState, LoadingState } from "../../components/common/AsyncState";
import { getCourses, type CourseRow } from "../../services/courseService";
import { formatMoney } from "../../utils/text";
import { PageIntro } from "./TreatmentsPage";

export function CoursesPage() {
  const [courses, setCourses] = useState<CourseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    getCourses()
      .then(setCourses)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  return (
    <section className="mx-auto max-w-7xl px-6 py-16 md:px-8 md:py-24">
      <PageIntro eyebrow="Cursos" title="Formación clínica premium para profesionales y estudiantes del área estética." />
      <div className="mt-12">
        {loading && <LoadingState />}
        {error && <ErrorState />}
        {!loading && !error && courses.length === 0 && <EmptyState />}
        <div className="grid gap-6 md:grid-cols-2">
          {courses.map((course) => (
            <article key={course.id} className="overflow-hidden rounded-[30px] border border-[var(--color-border)] bg-white/60">
              <img src={course.cover_image ?? "/doctora/dra3.jpg"} alt={course.title} className="h-72 w-full object-cover" />
              <div className="p-6">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--color-accent-strong)]">{course.city} · {course.modality}</p>
                <h2 className="mt-3 text-2xl font-semibold">{course.title}</h2>
                <p className="mt-3 text-sm leading-7 text-[var(--color-copy)]">{course.short_description}</p>
                <div className="mt-5 grid gap-2 text-sm text-[var(--color-copy)] sm:grid-cols-2">
                  <span>{course.start_date} · {course.start_time}</span>
                  <span>{formatMoney(course.price)} · {course.available_slots ?? 0} cupos</span>
                </div>
                <Link to={`/cursos/${course.slug}`} className="mt-6 inline-flex rounded-full bg-[var(--color-mocha)] px-6 py-3 text-sm font-semibold text-white">
                  Ver curso
                </Link>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
