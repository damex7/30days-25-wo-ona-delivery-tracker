import type { MetadataRoute } from "next";

// Makes the site installable ("Add to Home screen"). A rider gets an app icon
// and a full-screen window without browser bars, with no app store involved.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Wo Ọ̀nà: live delivery tracking",
    short_name: "Wo Ọ̀nà",
    description: "Riders share their location; customers watch their parcel arrive.",
    start_url: "/rider",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#FFFFFF",
    theme_color: "#0B0B0C",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
