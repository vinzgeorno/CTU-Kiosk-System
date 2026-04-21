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
                } }), _jsxs("div", { style: {
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
