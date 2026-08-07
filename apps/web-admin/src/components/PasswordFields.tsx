"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

/** Mirrors MIN_PASSWORD_LENGTH in the backend's password DTO. */
export const MIN_PASSWORD_LENGTH = 8;

/**
 * A password input with a show/hide toggle.
 *
 * Being able to see what you typed matters most on exactly the screens this
 * is used on — setting a new password, where a typo you can't see becomes an
 * account you can't get into. `autoComplete` is passed through rather than
 * defaulted so each caller can tell the browser's password manager whether
 * this is the old password, a new one, or a login.
 */
export function PasswordField({
  id,
  label,
  value,
  onChange,
  autoComplete,
  hint,
  minLength,
  required = true,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: "current-password" | "new-password";
  hint?: string;
  minLength?: number;
  required?: boolean;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-ink-2">
        {label}
      </label>
      <div className="relative mt-1">
        <input
          id={id}
          type={visible ? "text" : "password"}
          required={required}
          minLength={minLength}
          autoComplete={autoComplete}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-md border border-hairline-strong px-3 py-2 pr-10 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"}
          className="absolute inset-y-0 right-0 flex items-center px-3 text-ink-3 hover:text-ink-2"
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      {hint && <p className="mt-1 text-xs text-ink-3">{hint}</p>}
    </div>
  );
}
