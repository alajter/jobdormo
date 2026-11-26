import { redirect } from "next/navigation";

// "Job search" became Today.
export default function JobSearchPage() {
  redirect("/dashboard");
}
