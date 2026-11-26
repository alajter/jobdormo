"use client";
import { createContext, useContext } from "react";
import type { CvTrack } from "@/models/cvTrack.model";

// CV tracks for the jobs screen: the filter's options and each job's label.
const CvTracksContext = createContext<CvTrack[]>([]);

export const CvTracksProvider = CvTracksContext.Provider;

export function useCvTracks(): CvTrack[] {
  return useContext(CvTracksContext);
}

export function useTrackLabel(): (id?: string | null) => string | null {
  const tracks = useCvTracks();
  return (id) => (id ? (tracks.find((t) => t.id === id)?.label ?? id) : null);
}
