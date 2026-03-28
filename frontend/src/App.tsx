import WelcomePage from "./pages/WelcomePage";
import KioskStartPage from "./pages/KioskStartPage";
import AdminPage from "./pages/AdminPage";

export default function App() {
  const pathname = window.location.pathname;

  if (pathname === "/admin") return <AdminPage />;
  if (pathname === "/kiosk") return <KioskStartPage />;
  if (pathname === "/") return <WelcomePage />;

  return <WelcomePage />;
}
