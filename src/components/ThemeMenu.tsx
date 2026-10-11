import { Monitor, Moon, Sun } from "lucide-react";
import type { Theme } from "../theme";
import { NativeSelect, NativeSelectOption } from "./ui/native-select";

export function ThemeMenu({ theme, onChange }: { theme: Theme; onChange: (theme: Theme) => void }) {
  return (
    <div className="theme-picker" title="切換外觀">
      <span className="theme-symbol" aria-hidden="true">
        {theme === "system" ? <Monitor /> : theme === "dark" ? <Moon /> : <Sun />}
      </span>
      <NativeSelect
        aria-label="切換外觀"
        value={theme}
        onChange={(event) => {
          const value = event.target.value;
          if (value === "light" || value === "dark" || value === "system") onChange(value);
        }}
      >
        <NativeSelectOption value="light">淺色</NativeSelectOption>
        <NativeSelectOption value="dark">深色</NativeSelectOption>
        <NativeSelectOption value="system">跟隨系統</NativeSelectOption>
      </NativeSelect>
    </div>
  );
}
