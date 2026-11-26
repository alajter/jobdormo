"use server";
import { requireUser } from "./shared";
import { loadCvTracks } from "@/lib/cv/tracks";
import type { CvTrack } from "@/models/cvTrack.model";

// The user's CV tracks (from <CV_DIR>/tracks.json), for filters and labels.
export const getCvTracks = async (): Promise<CvTrack[]> => {
  try {
    await requireUser();
    return loadCvTracks();
  } catch {
    return [];
  }
};
