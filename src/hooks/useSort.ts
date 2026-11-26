"use client";
import { useCallback, useMemo, useState } from "react";
import { useHydrated } from "./useHydrated";
import type { SortDir, SortState } from "@/models/sort.model";

const flip = (dir: SortDir): SortDir => (dir === "asc" ? "desc" : "asc");

// The third click clears: with no sort dropdown, it is the only way back
// to the page's default order.
export function nextSort<F extends string>(
  prev: SortState<F> | null,
  field: F,
  natural: SortDir,
): SortState<F> | null {
  if (!prev || prev.field !== field) return { field, dir: natural };
  if (prev.dir === natural) return { field, dir: flip(natural) };
  return null;
}

// Browser storage can throw (private mode, blocked site data); the sort then
// simply isn't remembered.
function readRaw(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeRaw(key: string, value: string | null) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // not remembered; fine
  }
}

export function parseSavedSort<F extends string>(
  raw: string | null,
  naturalDirs: Readonly<Record<F, SortDir>>,
): SortState<F> | null {
  if (!raw) return null;
  try {
    const s = JSON.parse(raw);
    return s && s.field in naturalDirs && (s.dir === "asc" || s.dir === "desc")
      ? { field: s.field as F, dir: s.dir }
      : null;
  } catch {
    return null;
  }
}

// With a storageKey, the last sort is remembered in this browser, so leaving
// the page and coming back keeps it. Read after hydration to avoid a mismatch.
export function useSort<F extends string>(
  naturalDirs: Readonly<Record<F, SortDir>>,
  storageKey?: string,
) {
  const hydrated = useHydrated();
  // undefined = nothing chosen on this visit yet, so the saved sort applies.
  const [chosen, setChosen] = useState<SortState<F> | null | undefined>(undefined);
  const raw = hydrated && storageKey ? readRaw(storageKey) : null;
  // Memoized on the raw string: consumers refetch when the sort object changes.
  const saved = useMemo(() => parseSavedSort(raw, naturalDirs), [raw, naturalDirs]);
  const sort = chosen === undefined ? saved : chosen;

  const toggleSort = useCallback(
    (field: F) => {
      const next = nextSort(sort, field, naturalDirs[field]);
      setChosen(next);
      if (storageKey) writeRaw(storageKey, next ? JSON.stringify(next) : null);
    },
    [sort, naturalDirs, storageKey],
  );

  return { sort, toggleSort };
}
