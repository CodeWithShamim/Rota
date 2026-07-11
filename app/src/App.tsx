import { Route, Routes } from "react-router-dom";
import { Header } from "./components/Header";
import { Toasts } from "./components/Toasts";
import { CircleDetailPage } from "./pages/CircleDetail";
import { CreatePage } from "./pages/Create";
import { DashboardPage } from "./pages/Dashboard";
import { LandingPage } from "./pages/Landing";
import { PassportPage } from "./pages/Passport";
import { PotDetailPage } from "./pages/PotDetail";

export default function App() {
  return (
    <div className="min-h-screen">
      <Header />
      <main className="mx-auto max-w-5xl px-4 py-6">
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/app" element={<DashboardPage />} />
          <Route path="/app/create" element={<CreatePage />} />
          <Route path="/app/circle/:address" element={<CircleDetailPage />} />
          <Route path="/app/pot/:address" element={<PotDetailPage />} />
          <Route path="/app/reputation/:address?" element={<PassportPage />} />
        </Routes>
      </main>
      <Toasts />
    </div>
  );
}
