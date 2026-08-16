import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { syncMyAccount } from "@/lib/account.functions";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Andam — Live TV, Movies & Shows" },
      {
        name: "description",
        content:
          "Andam streaming home: live matches, trending movies, popular shows, IPTV channels, prayer times and Quran.",
      },
      { property: "og:title", content: "Andam — Live TV, Movies & Shows" },
      {
        property: "og:description",
        content:
          "Live matches, trending movies, popular shows and your IPTV channels in one cinematic home.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function AuthBadge() {
  const { data } = useQuery({
    queryKey: ["home-session"],
    queryFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return null;
      return syncMyAccount({ data: { recordLogin: false } });
    },
    staleTime: 60_000,
  });

  const style = {
    position: "fixed" as const,
    top: 14,
    right: 16,
    zIndex: 50,
    display: "inline-flex",
    minHeight: 44,
    alignItems: "center",
    gap: 8,
    padding: "0 16px",
    borderRadius: 999,
    background: "rgba(5,5,5,.72)",
    backdropFilter: "blur(12px)",
    border: "1px solid rgba(255,69,0,.45)",
    color: "#fff",
    fontFamily: "Inter, system-ui, sans-serif",
    fontSize: 14,
    textDecoration: "none",
  };

  if (!data) {
    return (
      <Link to="/auth" style={style}>
        Sign in
      </Link>
    );
  }

  return (
    <div style={{ ...style, gap: 12 }}>
      {data.role === "admin" && (
        <Link to="/admin" style={{ color: "#FF4500", textDecoration: "none" }}>
          Admin
        </Link>
      )}
      <Link to="/account" style={{ color: "#fff", textDecoration: "none" }}>
        Account
      </Link>
    </div>
  );
}

function Index() {
  return (
    <>
      <AuthBadge />
      <iframe
      src="/andam.html"
      title="Andam streaming homepage"
      style={{
        position: "fixed",
        inset: 0,
        width: "100%",
        height: "100%",
        border: 0,
        background: "#08090C",
        }}
      />
    </>
  );
}
