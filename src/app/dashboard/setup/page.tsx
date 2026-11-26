import { Metadata } from "next";
import { getSetupStatus } from "@/actions/setup.actions";
import { getCvTracks } from "@/actions/cvTrack.actions";
import { getUserSettings } from "@/actions/userSettings.actions";
import { SetupPage } from "@/components/setup/SetupPage";

export const metadata: Metadata = { title: "Set up" };
export const dynamic = "force-dynamic";

export default async function Setup() {
  const [steps, tracks, settings] = await Promise.all([getSetupStatus(), getCvTracks(), getUserSettings()]);
  return <SetupPage steps={steps} tracks={tracks} notes={settings?.data?.settings?.candidate?.notes ?? ""} />;
}
