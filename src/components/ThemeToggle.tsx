"use client";
import { useSyncExternalStore } from "react";
import { Laptop, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { updateDisplaySettings } from "@/actions/userSettings.actions";

type ThemeChoice = "light" | "dark" | "system";

const OPTIONS: { value: ThemeChoice; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Laptop },
];

// Header shortcut for Settings → Display → Theme; saves the same setting.
export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  // next-themes only knows the theme on the client; render "system" on the
  // server so hydration matches.
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  const current = (mounted ? (theme as ThemeChoice) : "system") ?? "system";
  const Icon = OPTIONS.find((o) => o.value === current)?.icon ?? Laptop;

  const choose = (value: string) => {
    setTheme(value);
    void updateDisplaySettings({ theme: value as ThemeChoice });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon" aria-label={`Theme: ${current}`} title="Theme">
          <Icon className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuRadioGroup value={current} onValueChange={choose}>
          {OPTIONS.map(({ value, label, icon: ItemIcon }) => (
            <DropdownMenuRadioItem key={value} value={value}>
              <ItemIcon className="mr-2 h-4 w-4" />
              {label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
