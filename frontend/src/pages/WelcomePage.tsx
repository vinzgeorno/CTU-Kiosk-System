import campusImage from "../images/campus.jpg";
import campusLogo from "../images/campus_logo.png";

export default function WelcomePage() {
	const goToKiosk = () => {
		window.location.pathname = "/kiosk";
	};

	return (
		<div
			style={{
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
			}}
		>
			<div
				style={{
					position: "absolute",
					inset: 0,
					background: "linear-gradient(135deg, rgba(5, 15, 30, 0.78) 0%, rgba(7, 18, 34, 0.68) 48%, rgba(9, 25, 46, 0.76) 100%)",
				}}
			/>

			<div
				style={{
					position: "relative",
					zIndex: 1,
					width: "min(92vw, 1024px)",
					height: "min(92vh, 600px)",
					boxSizing: "border-box",
					padding: "34px 42px",
					borderRadius: 24,
					background: "linear-gradient(165deg, rgba(255,255,255,0.16) 0%, rgba(255,255,255,0.09) 100%)",
					border: "1px solid rgba(255,255,255,0.26)",
					boxShadow: "0 30px 70px rgba(2, 6, 23, 0.5)",
					backdropFilter: "blur(8px)",
					display: "flex",
					flexDirection: "column",
					alignItems: "center",
					justifyContent: "center",
					textAlign: "center",
					gap: 16,
					overflow: "hidden",
				}}
			>
				<img
					src={campusLogo}
					alt="CTU Campus Logo"
					style={{
						width: 116,
						height: 116,
						objectFit: "contain",
						filter: "drop-shadow(0 8px 14px rgba(0, 0, 0, 0.35))",
						marginBottom: 2,
					}}
				/>

				<h1
					style={{
						margin: 0,
						fontSize: "clamp(34px, 5vw, 52px)",
						lineHeight: 1.08,
						color: "#f8fafc",
						fontWeight: 800,
						letterSpacing: 0.3,
					}}
				>
					CTU Kiosk Ticketing
				</h1>

				<p
					style={{
						margin: 0,
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						gap: 8,
						fontSize: "clamp(16px, 2.1vw, 21px)",
						lineHeight: 1.35,
						color: "rgba(241, 245, 249, 0.95)",
						maxWidth: 640,
					}}
				>
					<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
						<path d="M12 3L4 7V11C4 16 7.4 20.7 12 22C16.6 20.7 20 16 20 11V7L12 3Z" stroke="currentColor" strokeWidth="1.8"/>
						<path d="M9.5 12.2L11.3 14L14.8 10.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
					</svg>
					Touch Start Transaction to begin your secure ticket purchase.
				</p>

				<div
					style={{
						width: "min(100%, 430px)",
						marginTop: 8,
					}}
				>
					<button
						type="button"
						onClick={goToKiosk}
						style={{
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
						}}
					>
						<svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
							<path d="M5 12H19" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
							<path d="M13 6L19 12L13 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
						</svg>
						Start Transaction
					</button>
				</div>
			</div>
		</div>
	);
}
