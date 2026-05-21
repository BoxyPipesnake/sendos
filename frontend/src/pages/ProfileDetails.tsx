import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { analyzeProfile, getProfile } from "../api/client";
import type { ProfileResponse, ProfileStatus } from "../api/types";

const statusStyles: Record<ProfileStatus, string> = {
  pending_analysis: "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200",
  analyzing: "bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-200",
  completed: "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200",
};

const skillLevelStyles: Record<string, string> = {
  beginner: "bg-slate-50 text-slate-700 ring-slate-200",
  intermediate: "bg-sky-50 text-sky-700 ring-sky-200",
  advanced: "bg-violet-50 text-violet-700 ring-violet-200",
  expert: "bg-emerald-50 text-emerald-700 ring-emerald-200",
};

const defaultSkillStyle = "bg-zinc-50 text-zinc-700 ring-zinc-200";

function skillBadgeClass(level: string): string {
  return skillLevelStyles[level.toLowerCase()] ?? defaultSkillStyle;
}

export default function ProfileDetails() {
  const { id } = useParams<{ id: string }>();
  const [profile, setProfile] = useState<ProfileResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const pollRef = useRef<number | null>(null);

  const fetchProfile = useCallback(async () => {
    if (!id) return;
    try {
      const p = await getProfile(id);
      setProfile(p);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  useEffect(() => {
    if (profile?.status === "analyzing") {
      pollRef.current = window.setInterval(fetchProfile, 3000);
      return () => {
        if (pollRef.current !== null) window.clearInterval(pollRef.current);
      };
    }
  }, [profile?.status, fetchProfile]);

  async function handleAnalyze() {
    if (!id || !profile) return;
    setError(null);
    setAnalyzing(true);
    // Optimistically flip to analyzing so the polling effect kicks in immediately.
    setProfile({ ...profile, status: "analyzing" });
    try {
      await analyzeProfile(id);
      await fetchProfile();
    } catch (err) {
      setError((err as Error).message);
      // Refetch to recover the real status — router rolls back to pending_analysis on failure.
      await fetchProfile();
    } finally {
      setAnalyzing(false);
    }
  }

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-10">
        <p className="text-sm text-zinc-500">Loading…</p>
      </div>
    );
  }

  if (error && !profile) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-10">
        <Link
          to="/"
          className="inline-flex items-center text-sm text-brand-600 hover:text-brand-700"
        >
          &larr; Back
        </Link>
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      </div>
    );
  }

  if (!profile) return null;

  return (
    <div className="max-w-3xl mx-auto px-6 py-10 sm:py-12">
      <Link
        to="/"
        className="inline-flex items-center text-sm text-brand-600 hover:text-brand-700"
      >
        &larr; Back
      </Link>

      <section className="mt-4 rounded-2xl border border-zinc-200 bg-white p-6 sm:p-7 shadow-sm">
        <div className="flex items-start justify-between gap-4 mb-5">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-zinc-900">
              {profile.name}
            </h1>
            <p className="mt-1 text-sm text-zinc-600">{profile.current_role}</p>
          </div>
          <span
            className={`text-xs font-medium px-2.5 py-1 rounded-full whitespace-nowrap ${statusStyles[profile.status]}`}
          >
            {profile.status}
          </span>
        </div>

        <dl className="grid grid-cols-1 sm:grid-cols-3 gap-4 border-t border-zinc-100 pt-5">
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              Role
            </dt>
            <dd className="mt-1 text-sm text-zinc-900">{profile.current_role}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              Years of experience
            </dt>
            <dd className="mt-1 text-sm text-zinc-900">{profile.years_experience}</dd>
          </div>
          <div className="sm:col-span-3">
            <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              Bio
            </dt>
            <dd className="mt-1 text-sm text-zinc-700 leading-relaxed">
              {profile.bio}
            </dd>
          </div>
        </dl>

        {profile.status === "pending_analysis" && (
          <div className="mt-6 pt-5 border-t border-zinc-100">
            <button
              onClick={handleAnalyze}
              disabled={analyzing}
              className="inline-flex items-center justify-center rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-zinc-300 disabled:text-zinc-500 disabled:shadow-none"
            >
              {analyzing ? "Starting…" : "Analyze with AI"}
            </button>
          </div>
        )}

        {profile.status === "analyzing" && (
          <div className="mt-6 pt-5 border-t border-zinc-100">
            <div className="inline-flex items-center gap-2.5 text-sm text-brand-700">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full rounded-full bg-brand-500 opacity-75 animate-ping"></span>
                <span className="relative inline-flex h-2 w-2 rounded-full bg-brand-600"></span>
              </span>
              Analyzing… (may take 15-30 seconds)
            </div>
          </div>
        )}
      </section>

      {error && profile && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {profile.status === "completed" && profile.analysis && (
        <>
          <section className="mt-6 rounded-2xl border border-zinc-200 bg-white p-6 sm:p-7 shadow-sm">
            <h2 className="text-base font-semibold tracking-tight text-zinc-900 mb-4">
              Detected skills
            </h2>
            <div className="flex flex-wrap gap-2">
              {profile.analysis.detected_skills.map((s) => (
                <span
                  key={s.name}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset ${skillBadgeClass(s.level)}`}
                >
                  {s.name}
                  <span className="opacity-60 font-normal">·</span>
                  <span className="opacity-80 font-normal">{s.level}</span>
                </span>
              ))}
            </div>
          </section>

          <section className="mt-6 rounded-2xl border border-zinc-200 bg-white p-6 sm:p-7 shadow-sm">
            <h2 className="text-base font-semibold tracking-tight text-zinc-900 mb-3">
              Interests
            </h2>
            <ul className="space-y-1.5">
              {profile.analysis.interests.map((interest) => (
                <li
                  key={interest}
                  className="flex items-center gap-2.5 text-sm text-zinc-700"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-brand-500"></span>
                  {interest}
                </li>
              ))}
            </ul>
          </section>

          <section className="mt-8">
            <h2 className="text-lg font-semibold tracking-tight text-zinc-900 mb-4">
              Career path recommendations
            </h2>
            <div className="space-y-4">
              {profile.recommendations.map((rec) => (
                <article
                  key={rec.title}
                  className="rounded-2xl border border-zinc-200 bg-white p-6 sm:p-7 shadow-sm"
                >
                  <header className="flex items-start justify-between gap-4 mb-3">
                    <h3 className="text-lg font-semibold text-zinc-900">
                      {rec.title}
                    </h3>
                    <span className="shrink-0 inline-flex items-center rounded-full bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700 ring-1 ring-inset ring-brand-200">
                      ~{rec.duration_months} months
                    </span>
                  </header>
                  <p className="text-sm text-zinc-700 leading-relaxed mb-5">
                    {rec.description}
                  </p>
                  <ol className="space-y-4">
                    {rec.steps.map((step, i) => (
                      <li key={step.title} className="flex gap-3.5">
                        <div className="shrink-0 h-6 w-6 rounded-full bg-brand-600 text-white text-xs font-semibold flex items-center justify-center">
                          {i + 1}
                        </div>
                        <div className="flex-1 pt-0.5">
                          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                            <span className="text-sm font-medium text-zinc-900">
                              {step.title}
                            </span>
                            <span className="text-xs text-zinc-500">
                              {step.duration_weeks} weeks
                            </span>
                          </div>
                          {step.skills_to_develop.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {step.skills_to_develop.map((skill) => (
                                <span
                                  key={skill}
                                  className="rounded-md bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700"
                                >
                                  {skill}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </li>
                    ))}
                  </ol>
                </article>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
