"use client";

export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          fontFamily: "Georgia, serif",
          background: "#f6f3ec",
          color: "#1c2430",
        }}
      >
        <main style={{ maxWidth: 560, margin: "15vh auto", padding: 24 }}>
          <h1 style={{ fontSize: 32, fontWeight: 500 }}>The workspace hit an unexpected error</h1>
          <p style={{ lineHeight: 1.6 }}>
            Reload the page to try again.
            {error.digest ? ` Reference ${error.digest}.` : ""}
          </p>
          <button
            type="button"
            onClick={() => retry()}
            style={{
              marginTop: 16,
              border: "1px solid #1c2430",
              background: "transparent",
              borderRadius: 8,
              padding: "8px 14px",
            }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
