import { Metadata } from "next";
import { PeoplePage } from "@/components/people/PeoplePage";

export const metadata: Metadata = { title: "People" };

export default function People() {
  return <PeoplePage />;
}
