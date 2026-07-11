import { Route, Routes } from "react-router-dom";
import { Footer } from "./components/Footer";
import { Header } from "./components/Header";
import { Toasts } from "./components/Toasts";
import { CircleDetailPage } from "./pages/CircleDetail";
import { CreatePage } from "./pages/Create";
import { DashboardPage } from "./pages/Dashboard";
import { DocsPage } from "./pages/Docs";
import { LandingPage } from "./pages/Landing";
import { PassportPage } from "./pages/Passport";
import { PotDetailPage } from "./pages/PotDetail";

export default function App() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/docs" element={<DocsPage />} />
          <Route path="/app" element={<DashboardPage />} />
          <Route path="/app/create" element={<CreatePage />} />
          <Route path="/app/circle/:address" element={<CircleDetailPage />} />
          <Route path="/app/pot/:address" element={<PotDetailPage />} />
          <Route path="/app/reputation/:address?" element={<PassportPage />} />
        </Routes>
      </main>
      <Footer />
      <Toasts />
    </div>
  );
}
