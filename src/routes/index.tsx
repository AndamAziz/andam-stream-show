import { createFileRoute } from "@tanstack/react-router";

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

function Index() {
  return (
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
  );
}
