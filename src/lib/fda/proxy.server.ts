const ALLOWED_HOSTS = new Set(["www.fda.gov", "fda.gov"]);

/** Streams an FDA-hosted document through this origin to avoid cross-origin/download issues. */
export async function proxyFdaFile(target: string): Promise<Response> {
  let url: URL;
  try {
    url = new URL(target);
  } catch {
    return new Response("Bad request", { status: 400 });
  }
  if (url.protocol !== "https:" || !ALLOWED_HOSTS.has(url.hostname)) {
    return new Response("Forbidden", { status: 403 });
  }

  const upstream = await fetch(url.toString(), {
    headers: { "user-agent": "Mozilla/5.0 (compatible; FDA-Letters-Archive/1.0)" },
    redirect: "follow",
  });
  if (!upstream.ok || !upstream.body) {
    return new Response("Upstream unavailable", { status: 502 });
  }

  const type = upstream.headers.get("content-type") ?? "application/octet-stream";
  return new Response(upstream.body, {
    headers: {
      "content-type": type,
      "content-disposition": "inline",
      "cache-control": "public, max-age=3600",
      "x-content-type-options": "nosniff",
    },
  });
}
