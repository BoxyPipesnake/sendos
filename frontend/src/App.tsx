import { Routes, Route, Link } from "react-router-dom";
import CreateProfile from "./pages/CreateProfile";
import ProfileDetails from "./pages/ProfileDetails";

export default function App() {
  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <header className="border-b border-zinc-200 bg-white/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-3.5 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5 group">
            <div className="h-8 w-8 rounded-lg bg-brand-600 flex items-center justify-center text-white text-sm font-semibold shadow-sm group-hover:bg-brand-700 transition-colors">
              S
            </div>
            <div className="leading-tight">
              <div className="text-sm font-semibold text-zinc-900">Sendos</div>
              <div className="text-[11px] text-zinc-500">Skill Recommender</div>
            </div>
          </Link>
        </div>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<CreateProfile />} />
          <Route path="/profiles/:id" element={<ProfileDetails />} />
        </Routes>
      </main>
    </div>
  );
}
