"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import logoIcon from "@/assets/logo-icon.png";
import { IconClose, IconMenu } from "./icons";

const NAV_LINKS = [
  { href: "#features", label: "ฟีเจอร์" },
  { href: "#how-it-works", label: "วิธีการทำงาน" },
  { href: "#security", label: "ความปลอดภัย" },
  { href: "#pricing", label: "แพ็กเกจ" },
  { href: "#faq", label: "คำถามที่พบบ่อย" },
];

export default function LandingHeader() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-hairline bg-surface/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 md:px-6">
        <Link href="/" className="flex items-center gap-2">
          <Image src={logoIcon} alt="LaLa'" width={32} height={32} className="rounded-md" priority />
          <div className="leading-tight">
            <p className="text-base font-semibold text-ink">
              LaLa<span className="text-gold-700">&apos;</span>
            </p>
            <p className="hidden text-[11px] text-ink-3 sm:block">Leave &amp; Attendance on LINE</p>
          </div>
        </Link>

        <nav className="hidden items-center gap-7 md:flex">
          {NAV_LINKS.map((link) => (
            <a key={link.href} href={link.href} className="text-sm font-medium text-ink-2 transition-colors duration-150 hover:text-brand-600">
              {link.label}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          <Link href="/login" className="text-sm font-medium text-ink-2 transition-colors duration-150 hover:text-brand-600">
            เข้าสู่ระบบ
          </Link>
          <a
            href="#contact"
            className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-e1 transition-colors duration-150 hover:bg-brand-700"
          >
            เริ่มต้นใช้งาน
          </a>
        </div>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="rounded-md p-1.5 text-ink-2 transition-colors duration-150 hover:bg-bg md:hidden"
          aria-label={open ? "ปิดเมนู" : "เปิดเมนู"}
        >
          {open ? <IconClose className="h-5 w-5" /> : <IconMenu className="h-5 w-5" />}
        </button>
      </div>

      {open && (
        <div className="border-t border-hairline bg-surface px-4 py-4 md:hidden">
          <nav className="flex flex-col gap-1">
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="rounded-md px-2 py-2 text-sm font-medium text-ink-2 hover:bg-bg"
              >
                {link.label}
              </a>
            ))}
          </nav>
          <div className="mt-3 flex flex-col gap-2 border-t border-hairline pt-3">
            <Link
              href="/login"
              onClick={() => setOpen(false)}
              className="rounded-md border border-hairline px-4 py-2 text-center text-sm font-medium text-ink-2 hover:bg-bg"
            >
              เข้าสู่ระบบ
            </Link>
            <a
              href="#contact"
              onClick={() => setOpen(false)}
              className="rounded-md bg-brand-600 px-4 py-2 text-center text-sm font-medium text-white hover:bg-brand-700"
            >
              เริ่มต้นใช้งาน
            </a>
          </div>
        </div>
      )}
    </header>
  );
}
