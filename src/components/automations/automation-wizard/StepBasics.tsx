"use client";

import type { UseFormReturn } from "react-hook-form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import type { CreateAutomationInput } from "@/models/automation.schema";

export function StepBasics({
  form,
}: {
  form: UseFormReturn<CreateAutomationInput>;
}) {
  return (
    <>
      <FormField
        control={form.control}
        name="name"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Automation Name</FormLabel>
            <FormControl>
              <Input placeholder="e.g., Full Stack Jobs Calgary" {...field} />
            </FormControl>
            <FormDescription>
              A descriptive name to identify this automation
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="jobBoard"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Job Board</FormLabel>
            <Select onValueChange={field.onChange} value={field.value}>
              <FormControl>
                <SelectTrigger>
                  <SelectValue placeholder="Select a job board" />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                <SelectItem value="greenhouse">
                  Greenhouse (company boards)
                </SelectItem>
                <SelectItem value="lever">Lever (company boards)</SelectItem>
                <SelectItem value="ashby">Ashby (company boards)</SelectItem>
                <SelectItem value="vcboards">
                  VC boards (Team8 and VC portfolio boards)
                </SelectItem>
                <SelectItem value="comeet">Comeet (company boards)</SelectItem>
                <SelectItem value="teamtailor">
                  Teamtailor (company boards)
                </SelectItem>
                <SelectItem value="workable">Workable (company boards)</SelectItem>
                <SelectItem value="remoteboards">
                  Remote boards (Remotive, Himalayas, We Work Remotely)
                </SelectItem>
              </SelectContent>
            </Select>
            <FormDescription>
              Track specific companies&apos; job boards
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />
    </>
  );
}
