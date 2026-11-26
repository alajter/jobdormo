"use client";
import { useCallback, useSyncExternalStore } from "react";
import { TRACK_ID_REGEX } from "@/models/cvTrack.model";

// The CV track the user is "viewing as" ("all" = no track). Kept per browser
// in localStorage; every tab/component re-renders when it changes. Storage
// can throw (private mode, blocked site data); it then simply resets to "all".
const KEY = "active-cv-track";
const EVENT = "active-cv-track-change";
export const ALL_TRACKS = "all";

function read(): string {
  try {
    const v = window.localStorage.getItem(KEY);
    return v && TRACK_ID_REGEX.test(v) ? v : ALL_TRACKS;
  } catch {
    return ALL_TRACKS;
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function useActiveTrack(): [string, (next: string) => void] {
  const active = useSyncExternalStore(subscribe, read, () => ALL_TRACKS);
  const setActive = useCallback((next: string) => {
    try {
      if (next === ALL_TRACKS) window.localStorage.removeItem(KEY);
      else window.localStorage.setItem(KEY, next);
    } catch {
      // not remembered; fine
    }
    window.dispatchEvent(new Event(EVENT));
  }, []);
  return [active, setActive];
}
