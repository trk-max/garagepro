"use client";

export function reportClientError(source: "route-boundary" | "global-boundary", error: { name?: string; digest?: string }) {
  void fetch("/api/system-errors", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ source, name: error.name, digest: error.digest }),
    keepalive: true,
  })
    .then((response) => {
      if (!response.ok) console.warn("[monitoring] client error report unavailable");
    })
    .catch(() => console.warn("[monitoring] client error report unavailable"));
}
