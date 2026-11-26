"use server";
import prisma from "@/lib/db";
import { requireUser } from "./shared";
import { after } from "next/server";
import { draftPostText, ensureNextPost } from "@/lib/posts/autoPost";
import { isPostStatus } from "@/models/people.model";

// LinkedIn posts: ideas, drafts written with the AI in the user's voice,
// and what was posted. Posting itself is by hand (copy into LinkedIn).

export type PostRow = {
  id: string;
  campaignId: string | null;
  scheduledFor: Date | null;
  pillar: string | null;
  angle: string | null;
  impressions: number | null;
  reactions: number | null;
  comments: number | null;
  topic: string | null;
  body: string;
  status: string;
  postedAt: Date | null;
  url: string | null;
  updatedAt: Date;
};

const SELECT = {
  id: true,
  campaignId: true,
  scheduledFor: true,
  pillar: true,
  angle: true,
  impressions: true,
  reactions: true,
  comments: true,
  topic: true,
  body: true,
  status: true,
  postedAt: true,
  url: true,
  updatedAt: true,
};

export const getPosts = async (): Promise<PostRow[]> => {
  try {
    const user = await requireUser();
    return await prisma.linkedinPost.findMany({
      where: { userId: user.id },
      select: SELECT,
      // Planned posts in date order, then unplanned ones, newest first.
      orderBy: [{ scheduledFor: { sort: "asc", nulls: "last" } }, { updatedAt: "desc" }],
      take: 200,
    });
  } catch {
    return [];
  }
};

export const savePost = async (input: {
  id?: string;
  topic?: string;
  body: string;
  status?: string;
  url?: string;
}): Promise<{ success: boolean; id?: string; message?: string }> => {
  try {
    const user = await requireUser();
    const body = typeof input.body === "string" ? input.body.slice(0, 6000) : "";
    const status = isPostStatus(input.status) ? input.status : body.trim() ? "draft" : "idea";
    const data = {
      topic: input.topic?.trim().slice(0, 300) || null,
      body,
      status,
      url: input.url?.trim().slice(0, 500) || null,
      ...(status === "posted" ? { postedAt: new Date() } : {}),
    };
    if (input.id) {
      const current = await prisma.linkedinPost.findFirst({
        where: { id: input.id, userId: user.id },
        select: { status: true, postedAt: true },
      });
      if (!current) return { success: false, message: "Post not found." };
      // Keep the original posted date when an already-posted post is edited.
      if (status === "posted" && current.postedAt) delete (data as { postedAt?: Date }).postedAt;
      if (status !== "posted") Object.assign(data, { postedAt: null });
      await prisma.linkedinPost.updateMany({ where: { id: input.id, userId: user.id }, data });
      // Just posted: get the next one drafted for its slot, after this response.
      if (status === "posted" && current.status !== "posted") after(() => ensureNextPost(user.id).catch(() => undefined));
      return { success: true, id: input.id };
    }
    const created = await prisma.linkedinPost.create({ data: { ...data, userId: user.id } });
    return { success: true, id: created.id };
  } catch {
    return { success: false, message: "Couldn't save the post." };
  }
};

export const deletePost = async (id: string): Promise<{ success: boolean }> => {
  try {
    const user = await requireUser();
    const res = await prisma.linkedinPost.deleteMany({ where: { id, userId: user.id } });
    return { success: res.count === 1 };
  } catch {
    return { success: false };
  }
};

/**
 * Drafts (or rewrites) a LinkedIn post in the user's voice, from a topic and
 * their notes. With `current`, it rewrites that text following `instructions`.
 */
export const draftPost = async (input: {
  postId?: string;
  topic: string;
  notes?: string;
  current?: string;
  instructions?: string;
}): Promise<{ success: boolean; text?: string; message?: string }> => {
  try {
    const user = await requireUser();
    const topic = input.topic?.trim().slice(0, 300);
    if (!topic && !input.current?.trim()) return { success: false, message: "Add what the post is about." };
    return { success: true, text: await draftPostText(user.id, input) };
  } catch (e) {
    return { success: false, message: e instanceof Error ? e.message : "Couldn't draft the post." };
  }
};
