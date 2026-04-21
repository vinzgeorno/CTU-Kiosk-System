import { jsx as _jsx } from "react/jsx-runtime";
import WelcomePage from "./pages/WelcomePage";
import KioskStartPage from "./pages/KioskStartPage";
import AdminPage from "./pages/AdminPage";
export default function App() {
    const pathname = window.location.pathname;
    if (pathname === "/admin")
        return _jsx(AdminPage, {});
    if (pathname === "/kiosk")
        return _jsx(KioskStartPage, {});
    if (pathname === "/")
        return _jsx(WelcomePage, {});
    return _jsx(WelcomePage, {});
}
