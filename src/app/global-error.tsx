"use client";

export default function GlobalError({ retry }: { retry: () => void }) {
  return (
    <html lang="en">
      <body
        style={{
          background: "#f6f4ee",
          color: "#18211d",
          fontFamily: "system-ui, sans-serif",
          margin: 0,
        }}
      >
        <main style={{ margin: "0 auto", maxWidth: 560, padding: "48px 24px" }}>
          <p
            style={{
              color: "#214e3e",
              fontSize: 13,
              fontWeight: 800,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
            }}
          >
            Sunday Ledger · unavailable
          </p>
          <h1 style={{ fontSize: 36, lineHeight: 1.1 }}>
            The Ledger could not open
          </h1>
          <p style={{ fontSize: 17, lineHeight: 1.6 }}>
            The app shell did not load, and no league action was completed.
          </p>
          <button
            onClick={retry}
            style={{
              background: "#214e3e",
              border: 0,
              borderRadius: 8,
              color: "white",
              cursor: "pointer",
              fontSize: 16,
              fontWeight: 700,
              marginTop: 16,
              minHeight: 48,
              padding: "12px 20px",
            }}
            type="button"
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
