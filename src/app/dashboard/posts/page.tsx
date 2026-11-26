import { Metadata } from "next";
import { PostsPage } from "@/components/people/PostsPage";

export const metadata: Metadata = { title: "LinkedIn posts" };

export default function Posts() {
  return <PostsPage />;
}
