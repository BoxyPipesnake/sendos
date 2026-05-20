import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, Link } from "react-router-dom";
import { createProfile, listProfiles } from "../api/client";
import type { ProfileResponse, ProfileStatus } from "../api/types";

const statusColors: Record<ProfileStatus, string> = {
  pending_analysis: "bg-yellow-100 text-yellow-800",
  analyzing: "bg-blue-100 text-blue-800",
  completed: "bg-green-100 text-green-800",
};

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
    <div className="max-w-2xl mx-auto p-8">
      <h1 className="text-3xl font-bold mb-6">Create Profile</h1>

      {error && (
        <div className="bg-red-100 border border-red-300 text-red-800 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4 bg-white p-6 rounded shadow">
        <div>
          <label className="block text-sm font-medium mb-1">Name</label>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full border border-gray-300 rounded px-3 py-2"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Current role</label>
          <input
            type="text"
            required
            value={currentRole}
            onChange={(e) => setCurrentRole(e.target.value)}
            className="w-full border border-gray-300 rounded px-3 py-2"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Years of experience</label>
          <input
            type="number"
            required
            min="0"
            value={yearsExperience}
            onChange={(e) => setYearsExperience(e.target.value)}
            className="w-full border border-gray-300 rounded px-3 py-2"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Bio</label>
          <textarea
            required
            rows={4}
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            className="w-full border border-gray-300 rounded px-3 py-2"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">
            Skills (comma separated, optional)
          </label>
          <input
            type="text"
            value={skillsInput}
            onChange={(e) => setSkillsInput(e.target.value)}
            placeholder="Python, FastAPI, Postgres"
            className="w-full border border-gray-300 rounded px-3 py-2"
          />
        </div>
        <button
          type="submit"
          disabled={submitting}
          className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-medium px-4 py-2 rounded"
        >
          {submitting ? "Creating…" : "Create Profile"}
        </button>
      </form>

      <h2 className="text-xl font-semibold mt-10 mb-3">Recent profiles</h2>
      {listLoading && <p className="text-gray-600">Loading…</p>}
      {listError && (
        <div className="bg-red-100 border border-red-300 text-red-800 px-4 py-3 rounded">
          {listError}
        </div>
      )}
      {!listLoading && !listError && profiles.length === 0 && (
        <p className="text-gray-500">No profiles yet.</p>
      )}
      <ul className="space-y-2">
        {profiles.map((p) => (
          <li
            key={p.id}
            className="bg-white p-3 rounded shadow flex items-center justify-between"
          >
            <Link to={`/profiles/${p.id}`} className="text-blue-600 hover:underline">
              {p.name}
            </Link>
            <span
              className={`text-xs font-medium px-2 py-1 rounded ${statusColors[p.status]}`}
            >
              {p.status}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
