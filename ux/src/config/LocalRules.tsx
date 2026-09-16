import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";

import {
  EditorField,
  editorMenuItemSx,
  editorSelectSx,
  SubRow,
} from "./editor-kit.tsx";
import type { Doc } from "./inherit.ts";

const selectSx = editorSelectSx;

export function CookieDefaultsEdit({
  value,
  onChange,
}: {
  value: unknown;
  onChange: (next: unknown) => void;
}) {
  const row = (value !== null && typeof value === "object" ? value : {}) as Doc;

  const tri = (key: string, label: string) => (
    <EditorField label={label} width={56}>
      <Select
        value={row[key] === true ? "on" : row[key] === false ? "off" : ""}
        displayEmpty
        onChange={(e) => {
          const picked = String(e.target.value);
          const next = { ...row };
          if (picked === "") delete next[key];
          else next[key] = picked === "on";
          onChange(next);
        }}
        variant="outlined"
        sx={selectSx}
      >
        <MenuItem value="" sx={editorMenuItemSx}>—</MenuItem>
        <MenuItem value="on" sx={editorMenuItemSx}>on</MenuItem>
        <MenuItem value="off" sx={editorMenuItemSx}>off</MenuItem>
      </Select>
    </EditorField>
  );

  return (
    <SubRow>
      {tri("secure", "secure")}
      {tri("httpOnly", "http_only")}
      <EditorField label="same_site" width={72}>
        <Select
          value={typeof row.sameSite === "string" ? row.sameSite : ""}
          displayEmpty
          onChange={(e) => {
            const next = { ...row };
            if (e.target.value === "") delete next.sameSite;
            else next.sameSite = e.target.value;
            onChange(next);
          }}
          variant="outlined"
          sx={selectSx}
        >
          <MenuItem value="" sx={editorMenuItemSx}>—</MenuItem>
          {["Strict", "Lax", "None"].map((v) => (
            <MenuItem key={v} value={v} sx={editorMenuItemSx}>
              {v}
            </MenuItem>
          ))}
        </Select>
      </EditorField>
    </SubRow>
  );
}
