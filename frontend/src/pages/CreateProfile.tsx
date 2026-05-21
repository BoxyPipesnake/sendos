import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, Link } from "react-router-dom";
import { createProfile, listProfiles } from "../api/client";
import type { ProfileResponse, ProfileStatus } from "../api/types";

const statusStyles: Record<ProfileStatus, string> = {
  pending_analysis: "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200",
  analyzing: "bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-200",
  completed: "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200",
};

const inputClass =
  "w-full rounded-lg border border-zinc-300 bg-white px-3.5 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 shadow-sm transition focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20";

const labelClass = "block text-sm font-medium text-zinc-800 mb-1.5";

export default function CreateProfile() {
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [currentRole, setCurrentRole] = useState("");
  const [yearsExperience, setYearsExperience] = useState("");
  const [bio, setBio] = useState("");
  const [skillsInput, setSkillsInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [profiles, setProfiles] = useState<ProfileResponse[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  useEffect(() => {
    listProfiles()
      .then((data) => setProfiles(data))
      .catch((err: Error) => setListError(err.message))
      .finally(() => setListLoading(false));
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const skills = skillsInput
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      const result = await createProfile({
        name,
        current_role: currentRole,
        years_experience: Number(yearsExperience),
        bio,
        skills,
      });
      navigate(`/profiles/${result.id}`);
    } catch (err) {
      setError((err as Error).message);
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-10 sm:py-14">
      <div className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-900">
          Create Profile
        </h1>
      </div>

      {error && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="space-y-5 rounded-2xl border border-zinc-200 bg-white p-6 sm:p-7 shadow-sm"
      >
        <div>
          <label className={labelClass}>Name</label>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>Current role</label>
          <input
            type="text"
            required
            value={currentRole}
            onChange={(e) => setCurrentRole(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>Years of experience</label>
          <input
            type="number"
            required
            min="0"
            value={yearsExperience}
            onChange={(e) => setYearsExperience(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>Bio</label>
          <textarea
            required
            rows={4}
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            className={`${inputClass} resize-y`}
          />
        </div>
        <div>
          <label className={labelClass}>
            Skills (comma separated, optional)
          </label>
          <input
            type="text"
            value={skillsInput}
            onChange={(e) => setSkillsInput(e.target.value)}
            placeholder="Python, FastAPI, Postgres"
            className={inputClass}
          />
        </div>
        <div className="pt-2">
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center justify-center rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-zinc-300 disabled:text-zinc-500 disabled:shadow-none"
          >
            {submitting ? "Creating…" : "Create Profile"}
          </button>
        </div>
      </form>

      <div className="mt-12">
        <h2 className="text-lg font-semibold tracking-tight text-zinc-900 mb-4">
          Recent profiles
        </h2>
        {listLoading && (
          <p className="text-sm text-zinc-500">Loading…</p>
        )}
        {listError && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {listError}
          </div>
        )}
        {!listLoading && !listError && profiles.length === 0 && (
          <div className="rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-10 text-center">
            <p className="text-sm text-zinc-500">No profiles yet.</p>
          </div>
        )}
        {!listLoading && !listError && profiles.length > 0 && (
          <ul className="space-y-2">
            {profiles.map((p) => (
              <li
                key={p.id}
                className="group flex items-center justify-between rounded-xl border border-zinc-200 bg-white px-4 py-3 shadow-sm transition hover:border-brand-300 hover:shadow"
              >
                <Link
                  to={`/profiles/${p.id}`}
                  className="text-sm font-medium text-zinc-900 group-hover:text-brand-700"
                >
                  {p.name}
                </Link>
                <span
                  className={`text-xs font-medium px-2.5 py-1 rounded-full ${statusStyles[p.status]}`}
                >
                  {p.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
