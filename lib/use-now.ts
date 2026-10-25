"use client";
import { useEffect, useState } from "react";

/** The current time, updated every `ms`. Keeps "5 s ago" labels honest without reading the clock during render. */
export function useNow(ms = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}
