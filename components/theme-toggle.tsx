"use client";
// Light/dark toggle. The choice is saved in localStorage; a tiny script in the
// layout applies it BEFORE the page paints, so there's no white flash.
// useSyncExternalStore reads the current theme from the page itself, so the
// button is always in step with what's on screen.
import { useSyncExternalStore } from "react";

function isDark() {
  const t = document.documentElement.dataset.theme;
  return t ? t === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
}
function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  mq.addEventListener("change", onChange);
  return () => {
    observer.disconnect();
    mq.removeEventListener("change", onChange);
  };
}

export function ThemeToggle() {
  // On the server there's no page to read, so render the light-mode button.
  const dark = useSyncExternalStore(subscribe, isDark, () => false);
  function toggle() {
    const next = !dark;
    document.documentElement.dataset.theme = next ? "dark" : "light";
    try {
      localStorage.setItem("theme", next ? "dark" : "light");
    } catch {}
  }
  return (
    <button
      type="button"
      onClick={toggle}
      className="grid size-10 place-items-center rounded-xl text-on-bar hover:bg-white/15"
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      aria-pressed={dark}
    >
      <svg viewBox="0 0 24 24" className="size-5" aria-hidden="true">
        {dark ? (
          <path fill="currentColor" d="M12 4V2m0 20v-2m8-8h2M2 12h2m13.66-5.66 1.41-1.41M4.93 19.07l1.41-1.41m0-11.32L4.93 4.93m14.14 14.14-1.41-1.41M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        ) : (
          <path fill="currentColor" d="M21 14.5A9 9 0 0 1 9.5 3a7.5 7.5 0 1 0 11.5 11.5Z" />
        )}
      </svg>
    </button>
  );
}
