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
    <header className="sticky top-0 z-50 border-b border-neutral-200 bg-white/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 md:px-6">
        <Link href="/" className="flex items-center gap-2">
          <Image src={logoIcon} alt="LaLa'" width={32} height={32} className="rounded-md" priority />
          <div className="leading-tight">
            <p className="text-base font-semibold text-neutral-900">
              LaLa<span className="text-line-600">&apos;</span>
            </p>
            <p className="hidden text-[11px] text-neutral-500 sm:block">Leave &amp; Attendance on LINE</p>
          </div>
        </Link>

        <nav className="hidden items-center gap-7 md:flex">
          {NAV_LINKS.map((link) => (
            <a key={link.href} href={link.href} className="text-sm font-medium text-neutral-600 transition-colors hover:text-line-700">
              {link.label}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          <Link href="/login" className="text-sm font-medium text-neutral-600 transition-colors hover:text-line-700">
            เข้าสู่ระบบ
          </Link>
          <a
            href="#contact"
            className="rounded-lg bg-line-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-line-700"
          >
            เริ่มต้นใช้งาน
          </a>
        </div>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="rounded-lg p-1.5 text-neutral-600 transition-colors hover:bg-neutral-100 md:hidden"
          aria-label={open ? "ปิดเมนู" : "เปิดเมนู"}
        >
          {open ? <IconClose className="h-5 w-5" /> : <IconMenu className="h-5 w-5" />}
        </button>
      </div>

      {open && (
        <div className="border-t border-neutral-200 bg-white px-4 py-4 md:hidden">
          <nav className="flex flex-col gap-1">
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="rounded-lg px-2 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
              >
                {link.label}
              </a>
            ))}
          </nav>
          <div className="mt-3 flex flex-col gap-2 border-t border-neutral-100 pt-3">
            <Link
              href="/login"
              onClick={() => setOpen(false)}
              className="rounded-lg border border-neutral-200 px-4 py-2 text-center text-sm font-medium text-neutral-700 hover:bg-neutral-50"
            >
              เข้าสู่ระบบ
            </Link>
            <a
              href="#contact"
              onClick={() => setOpen(false)}
              className="rounded-lg bg-line-600 px-4 py-2 text-center text-sm font-medium text-white hover:bg-line-700"
            >
              เริ่มต้นใช้งาน
            </a>
          </div>
        </div>
      )}
    </header>
  );
}
