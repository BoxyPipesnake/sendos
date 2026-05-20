import { Routes, Route } from "react-router-dom";
import CreateProfile from "./pages/CreateProfile";
import ProfileDetails from "./pages/ProfileDetails";

export default function App() {
  return (
    <div className="min-h-screen bg-gray-50">
      <Routes>
        <Route path="/" element={<CreateProfile />} />
        <Route path="/profiles/:id" element={<ProfileDetails />} />
      </Routes>
    </div>
  );
}
