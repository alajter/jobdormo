"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "./shared";
import { getSearchRulesFor, saveSearchRulesFor } from "@/lib/search/rules.server";
import { DEFAULT_SEARCH_RULES, type SearchRules } from "@/models/searchRules.model";

export const getSearchRules = async (): Promise<SearchRules> => {
  try {
    const user = await requireUser();
    return await getSearchRulesFor(user.id);
  } catch {
    return { ...DEFAULT_SEARCH_RULES };
  }
};

export const saveSearchRules = async (input: unknown): Promise<{ success: boolean; rules?: SearchRules; message?: string }> => {
  try {
    const user = await requireUser();
    const rules = await saveSearchRulesFor(user.id, input);
    revalidatePath("/dashboard");
    return { success: true, rules };
  } catch {
    return { success: false, message: "Couldn't save your search rules." };
  }
};
