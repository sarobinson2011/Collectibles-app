// src/pages/HomePage.tsx

import { useNavigate } from "react-router-dom";

export function HomePage() {
    const navigate = useNavigate();

    return (
        <div
            style={{
                position: "relative",
                minHeight: "80vh",
                padding: "2rem",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                color: "white",
                textAlign: "center",
            }}
        >
            {/* Background gradient */}
            <div
                style={{
                    position: "absolute",
                    inset: 0,
                    background:
                        "linear-gradient(135deg, #1e293b 0%, #0f172a 50%, #1e293b 100%)",
                    backgroundSize: "200% 200%",
                    animation: "bgShift 12s ease infinite",
                    zIndex: -1,
                }}
            />

            <style>
                {`
          @keyframes bgShift {
            0% { background-position: 0% 50%; }
            50% { background-position: 100% 50%; }
            100% { background-position: 0% 50%; }
          }
        `}
            </style>

            <h1 style={{ fontSize: "3rem", marginBottom: "1rem" }}>
                Welcome to the Collectibles Platform
            </h1>
            <p style={{ maxWidth: "600px", fontSize: "1.2rem", opacity: 0.85 }}>
                On-chain authenticity, transparent provenance, and a seamless marketplace.
                Explore, collect, trade, and verify unique items - powered by Web3.
            </p>

            {/* BUTTON ROW */}
            <div
                style={{
                    display: "flex",
                    gap: "1rem",
                    marginTop: "2rem",
                    flexWrap: "wrap",
                    justifyContent: "center",
                }}
            >
                <HoverButton label="Explore Marketplace" onClick={() => navigate("/market")} />
                <HoverButton label="My Collectibles" onClick={() => navigate("/mine")} />
                <HoverButton label="Register Collectible" onClick={() => navigate("/admin")} />
            </div>

            {/* Feature grid */}
            <div
                style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))",
                    gap: "1.5rem",
                    marginTop: "4rem",
                    width: "100%",
                    maxWidth: "900px",
                }}
            >
                {[
                    {
                        title: "Authenticity Guaranteed",
                        text: "Every collectible has a cryptographic authenticity hash on-chain.",
                    },
                    {
                        title: "Transparent Ownership",
                        text: "View full provenance and activity logs for every item.",
                    },
                    {
                        title: "Secure Trading",
                        text: "Marketplace with escrow-like safety and on-chain settlement.",
                    },
                ].map((f) => (
                    <div
                        key={f.title}
                        style={{
                            background: "rgba(255,255,255,0.06)",
                            padding: "1.5rem",
                            borderRadius: "0.6rem",
                            backdropFilter: "blur(4px)",
                            border: "1px solid rgba(255,255,255,0.08)",
                        }}
                    >
                        <h3 style={{ marginBottom: "0.5rem" }}>{f.title}</h3>
                        <p style={{ opacity: 0.8 }}>{f.text}</p>
                    </div>
                ))}
            </div>
        </div>
    );
}

type HBProps = {
    label: string;
    onClick: () => void;
};

/* -----------------------------
   Reusable Hover Button Component
----------------------------- */
function HoverButton({ label, onClick }: HBProps) {
    const baseStyle: React.CSSProperties = {
        padding: "0.75rem 1.5rem",
        borderRadius: "0.5rem",
        backgroundColor: "#334155",
        color: "white",
        border: "1px solid #475569",
        cursor: "pointer",
        fontSize: "1rem",
        transition: "all 0.25s ease",
        transform: "scale(1)",
        display: "inline-block",
    };

    return (
        <button
            onClick={onClick}
            style={baseStyle}
            onMouseEnter={(e) => {
                const el = e.currentTarget;
                el.style.backgroundColor = "#475569";
                el.style.borderColor = "#64748b";
                el.style.transform = "scale(1.06)";
            }}
            onMouseLeave={(e) => {
                const el = e.currentTarget;
                el.style.backgroundColor = "#334155";
                el.style.borderColor = "#475569";
                el.style.transform = "scale(1)";
            }}
        >
            {label}
        </button>
    );
}
