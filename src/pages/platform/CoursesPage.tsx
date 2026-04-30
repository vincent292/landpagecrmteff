import { useEffect, useMemo, useState } from "react";

import { Link } from "react-router-dom";

import { EmptyState, ErrorState, LoadingState } from "../../components/common/AsyncState";
import { InfoRequestModal } from "../../components/platform/InfoRequestModal";
import { boliviaCities } from "../../data/cities";
import { getCourses, type CourseRow } from "../../services/courseService";
import { formatMoney } from "../../utils/text";
import { PageIntro } from "./TreatmentsPage";

export function CoursesPage() {
  const [courses, setCourses] = useState<CourseRow[]>([]);
  const [city, setCity] = useState("Todas");
  const [interest, setInterest] = useState<CourseRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    getCourses()
      .then(setCourses)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  const filteredCourses = useMemo(() => courses.filter((course) => city === "Todas" || course.city === city), [city, courses]);

  return (
    <section className="mx-auto max-w-7xl px-6 py-16 md:px-8 md:py-24">
      <PageIntro eyebrow="Cursos" title="Formación clínica premium para profesionales y estudiantes del área estética." />
      <div className="mt-8 max-w-xs"><select value={city} onChange={(event) => setCity(event.target.value)} className="premium-input"><option>Todas</option>{boliviaCities.map((item) => <option key={item}>{item}</option>)}</select></div>
      <div className="mt-12">
        {loading && <LoadingState />}
        {error && <ErrorState />}
        {!loading && !error && filteredCourses.length === 0 && <EmptyState />}
        <div className="grid gap-6 md:grid-cols-2">
          {filteredCourses.map((course) => (
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
                <div className="mt-6 flex flex-wrap gap-3">
                  <Link to={`/cursos/${course.slug}`} className="inline-flex rounded-full bg-[var(--color-mocha)] px-6 py-3 text-sm font-semibold text-white">
                    Ver curso
                  </Link>
                  <button type="button" onClick={() => setInterest(course)} className="rounded-full border border-[var(--color-border)] px-6 py-3 text-sm font-semibold">
                    Más información
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
      <InfoRequestModal open={Boolean(interest)} interest={interest?.title ?? ""} interestId={interest?.id} interestType="Curso" onClose={() => setInterest(null)} />
    </section>
  );
}


