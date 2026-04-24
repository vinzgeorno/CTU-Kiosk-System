import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import campusImage from "../images/campus.jpg";
import campusLogo from "../images/campus_logo.png";
export default function WelcomePage() {
    const goToKiosk = () => {
        window.location.pathname = "/kiosk";
    };
    return (_jsxs("div", { style: {
            position: "fixed",
            inset: 0,
            width: "100vw",
            height: "100vh",
            overflow: "hidden",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundImage: `url(${campusImage})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            backgroundRepeat: "no-repeat",
            fontFamily: "Inter, Segoe UI, Arial, sans-serif",
        }, children: [_jsx("div", { style: {
                    position: "absolute",
                    inset: 0,
                    background: "linear-gradient(135deg, rgba(6, 16, 30, 0.64) 0%, rgba(7, 18, 34, 0.54) 48%, rgba(9, 25, 46, 0.62) 100%)",
                } }), _jsx("button", { type: "button", "aria-label": "Open admin", onClick: () => {
                    window.location.pathname = "/admin";
                }, style: {
                    position: "fixed",
                    top: 24,
                    left: 24,
                    zIndex: 6,
                    width: 48,
                    height: 48,
                    borderRadius: 12,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "rgba(255,255,255,0.12)",
                    border: "1px solid rgba(255,255,255,0.25)",
                    cursor: "pointer",
                }, children: _jsxs("svg", { width: "20", height: "20", viewBox: "0 0 24 24", fill: "none", "aria-hidden": "true", children: [_jsx("path", { d: "M12 15.5A3.5 3.5 0 1 0 12 8.5a3.5 3.5 0 0 0 0 7z", stroke: "white", strokeWidth: "1.4", strokeLinecap: "round", strokeLinejoin: "round" }), _jsx("path", { d: "M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06A2 2 0 1 1 2.28 16.9l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09c.7 0 1.3-.4 1.51-1a1.65 1.65 0 0 0-.33-1.82L4.3 4.7A2 2 0 1 1 7.13 1.87l.06.06c.5.5 1.2.7 1.82.33.5-.3 1.1-.47 1.7-.47h.02c.6 0 1.2.17 1.7.47.62.37 1.32.17 1.82-.33l.06-.06A2 2 0 1 1 20.87 4.7l-.06.06a1.65 1.65 0 0 0-.33 1.82c.2.6.5 1 1 1.51H21a2 2 0 0 1 0 4h-.09c-.7 0-1.3.4-1.51 1z", stroke: "white", strokeWidth: "1.4", strokeLinecap: "round", strokeLinejoin: "round" })] }) }), _jsxs("div", { style: {
                    position: "relative",
                    zIndex: 1,
                    width: "min(88vw, 960px)",
                    height: "min(86vh, 540px)",
                    boxSizing: "border-box",
                    padding: "30px 38px",
                    borderRadius: 24,
                    background: "linear-gradient(165deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0.07) 100%)",
                    border: "1px solid rgba(255,255,255,0.2)",
                    boxShadow: "0 24px 56px rgba(2, 6, 23, 0.42)",
                    backdropFilter: "blur(5px)",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    textAlign: "center",
                    gap: 16,
                    overflow: "hidden",
                }, children: [_jsx("img", { src: campusLogo, alt: "CTU Campus Logo", style: {
                            width: 116,
                            height: 116,
                            objectFit: "contain",
                            filter: "drop-shadow(0 8px 14px rgba(0, 0, 0, 0.35))",
                            marginBottom: 2,
                        } }), _jsx("h1", { style: {
                            margin: 0,
                            fontSize: "clamp(34px, 5vw, 52px)",
                            lineHeight: 1.08,
                            color: "#f8fafc",
                            fontWeight: 800,
                            letterSpacing: 0.3,
                        }, children: "CTU Kiosk Ticketing" }), _jsxs("p", { style: {
                            margin: 0,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: 8,
                            fontSize: "clamp(16px, 2.1vw, 21px)",
                            lineHeight: 1.35,
                            color: "rgba(241, 245, 249, 0.95)",
                            maxWidth: 640,
                        }, children: [_jsxs("svg", { width: "18", height: "18", viewBox: "0 0 24 24", fill: "none", "aria-hidden": "true", children: [_jsx("path", { d: "M12 3L4 7V11C4 16 7.4 20.7 12 22C16.6 20.7 20 16 20 11V7L12 3Z", stroke: "currentColor", strokeWidth: "1.8" }), _jsx("path", { d: "M9.5 12.2L11.3 14L14.8 10.5", stroke: "currentColor", strokeWidth: "1.8", strokeLinecap: "round", strokeLinejoin: "round" })] }), "Touch Start Transaction to begin your secure ticket purchase."] }), _jsx("div", { style: {
                            width: "min(100%, 430px)",
                            marginTop: 8,
                        }, children: _jsxs("button", { type: "button", onClick: goToKiosk, style: {
                                height: 76,
                                borderRadius: 18,
                                border: "none",
                                background: "linear-gradient(135deg, #38bdf8 0%, #0284c7 42%, #0369a1 100%)",
                                color: "#ffffff",
                                fontSize: 27,
                                fontWeight: 800,
                                cursor: "pointer",
                                letterSpacing: 0.2,
                                display: "inline-flex",
                                alignItems: "center",
                                justifyContent: "center",
                                gap: 12,
                                boxShadow: "0 12px 30px rgba(2, 132, 199, 0.4)",
                            }, children: [_jsxs("svg", { width: "24", height: "24", viewBox: "0 0 24 24", fill: "none", "aria-hidden": "true", children: [_jsx("path", { d: "M5 12H19", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round" }), _jsx("path", { d: "M13 6L19 12L13 18", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round" })] }), "Start Transaction"] }) })] })] }));
}
