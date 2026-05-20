import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { analyzeProfile, getProfile } from "../api/client";
import type { ProfileResponse, ProfileStatus } from "../api/types";

const statusColors: Record<ProfileStatus, string> = {
  pending_analysis: "bg-yellow-100 text-yellow-800",
  analyzing: "bg-blue-100 text-blue-800",
  completed: "bg-green-100 text-green-800",
};

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

  if (loading) return <p className="p-8 text-gray-600">Loading…</p>;

  if (error && !profile) {
    return (
      <div className="max-w-2xl mx-auto p-8">
        <Link to="/" className="text-blue-600 hover:underline">
          &larr; Back
        </Link>
        <div className="bg-red-100 border border-red-300 text-red-800 px-4 py-3 rounded mt-4">
          {error}
        </div>
      </div>
    );
  }

  if (!profile) return null;

  return (
    <div className="max-w-3xl mx-auto p-8">
      <Link to="/" className="text-blue-600 hover:underline">
        &larr; Back
      </Link>

      <div className="mt-4 bg-white p-6 rounded shadow">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-3xl font-bold">{profile.name}</h1>
          <span
            className={`text-sm font-medium px-3 py-1 rounded ${statusColors[profile.status]}`}
          >
            {profile.status}
          </span>
        </div>
        <dl className="space-y-2 text-sm">
          <div>
            <dt className="inline font-medium">Role:</dt>{" "}
            <dd className="inline">{profile.current_role}</dd>
          </div>
          <div>
            <dt className="inline font-medium">Years of experience:</dt>{" "}
            <dd className="inline">{profile.years_experience}</dd>
          </div>
          <div>
            <dt className="font-medium">Bio:</dt>
            <dd className="text-gray-700">{profile.bio}</dd>
          </div>
        </dl>

        {profile.status === "pending_analysis" && (
          <button
            onClick={handleAnalyze}
            disabled={analyzing}
            className="mt-4 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-medium px-4 py-2 rounded"
          >
            {analyzing ? "Starting…" : "Analyze with AI"}
          </button>
        )}

        {profile.status === "analyzing" && (
          <p className="mt-4 text-blue-700">Analyzing… (may take 15-30 seconds)</p>
        )}
      </div>

      {error && profile && (
        <div className="bg-red-100 border border-red-300 text-red-800 px-4 py-3 rounded mt-4">
          {error}
        </div>
      )}

      {profile.status === "completed" && profile.analysis && (
        <>
          <section className="mt-6 bg-white p-6 rounded shadow">
            <h2 className="text-xl font-semibold mb-3">Detected skills</h2>
            <div className="flex flex-wrap gap-2">
              {profile.analysis.detected_skills.map((s) => (
                <span
                  key={s.name}
                  className="bg-blue-50 text-blue-700 text-sm px-3 py-1 rounded border border-blue-200"
                >
                  {s.name}{" "}
                  <span className="text-xs text-blue-500">({s.level})</span>
                </span>
              ))}
            </div>
          </section>

          <section className="mt-6 bg-white p-6 rounded shadow">
            <h2 className="text-xl font-semibold mb-3">Interests</h2>
            <ul className="list-disc list-inside text-gray-700">
              {profile.analysis.interests.map((interest) => (
                <li key={interest}>{interest}</li>
              ))}
            </ul>
          </section>

          <section className="mt-6">
            <h2 className="text-xl font-semibold mb-3">
              Career path recommendations
            </h2>
            <div className="space-y-4">
              {profile.recommendations.map((rec) => (
                <div key={rec.title} className="bg-white p-6 rounded shadow">
                  <h3 className="text-lg font-bold">{rec.title}</h3>
                  <p className="text-sm text-gray-500 mb-2">
                    ~{rec.duration_months} months
                  </p>
                  <p className="text-gray-700 mb-4">{rec.description}</p>
                  <ol className="space-y-3 list-decimal list-inside">
                    {rec.steps.map((step) => (
                      <li key={step.title}>
                        <span className="font-medium">{step.title}</span>
                        <span className="text-sm text-gray-500">
                          {" "}
                          ({step.duration_weeks} weeks)
                        </span>
                        <div className="ml-6 flex flex-wrap gap-1 mt-1">
                          {step.skills_to_develop.map((skill) => (
                            <span
                              key={skill}
                              className="bg-gray-100 text-gray-700 text-xs px-2 py-1 rounded"
                            >
                              {skill}
                            </span>
                          ))}
                        </div>
                      </li>
                    ))}
                  </ol>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
