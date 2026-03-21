import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ThemeToggleProps {
  className?: string;
  iconClassName?: string;
}

export function ThemeToggle({ className, iconClassName }: ThemeToggleProps = {}) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  const isDark = theme === "dark";
  return (
    <Button
      variant="outline"
      size="icon"
      aria-label="Toggle theme"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className={`rounded-full border-2 border-white/60 bg-white/70 backdrop-blur transition-all hover:bg-gradient-to-r hover:from-blue-50 hover:to-purple-50 dark:border-white/10 dark:bg-black/55 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_12px_28px_rgba(0,0,0,0.38)] dark:hover:bg-black/72 ${className || ""}`}
    >
      {isDark ? <Sun className={`h-5 w-5 text-yellow-400 ${iconClassName || ""}`} /> : <Moon className={`h-5 w-5 text-blue-600 ${iconClassName || ""}`} />}
    </Button>
  );
}
