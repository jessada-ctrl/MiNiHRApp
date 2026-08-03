"use client";

import { useState } from "react";
import { IconChevronDown } from "./icons";

const FAQS = [
  {
    q: "พนักงานต้องโหลดแอปเพิ่มไหม?",
    a: "ไม่ต้อง พนักงานยื่นคำขอลาและสแกนเข้างานผ่าน LINE Official Account ของบริษัทที่แอดไว้อยู่แล้ว เปิดใช้งานผ่าน LIFF ในหน้าแชทได้ทันทีโดยไม่ต้องติดตั้งแอปแยก",
  },
  {
    q: "ข้อมูลของแต่ละบริษัทปะปนกันหรือไม่?",
    a: "ไม่ปะปนกัน ระบบแยกข้อมูล (Data Isolation) ของแต่ละองค์กรออกจากกัน 100% ทั้งฐานข้อมูลและช่องทางส่งข้อความ LINE โดยมี Global Query Filter บังคับกรองด้วย tenant_id ทุกคำสั่งฝั่งเซิร์ฟเวอร์",
  },
  {
    q: "ใช้ LINE Official Account ของบริษัทเองได้ไหม?",
    a: "ได้ ฝ่ายบุคคลสามารถนำ Channel ID, Channel Secret และ Channel Access Token ของ LINE OA บริษัทมาตั้งค่าเองได้จากหน้าเว็บแอดมิน ระบบจะสร้าง Webhook แยกเฉพาะของบริษัทให้อัตโนมัติ",
  },
  {
    q: "ตั้งค่าสายอนุมัติยุ่งยากหรือไม่?",
    a: "ไม่ยุ่งยาก ใช้เครื่องมือลากวาง (Drag & Drop) สร้างขั้นตอนอนุมัติได้เองกี่ขั้นก็ได้ แยกโฟลว์อิสระตามแผนก สาขา หรือประเภทการลา ไม่ต้องเขียนโค้ด",
  },
  {
    q: "ถ้าพนักงานลาเกินโควตาจะเกิดอะไรขึ้น?",
    a: "ระบบจะแจ้งเตือนพนักงานและให้ยืนยันยินยอมก่อนส่งคำขอ เมื่อได้รับอนุมัติครบแล้วจะแจ้งเตือนฝ่ายบุคคลทันทีพร้อมติดธงในรายงาน เพื่อใช้พิจารณาการหักค่าจ้างตอนสิ้นเดือน",
  },
];

export default function FaqAccordion() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-3">
      {FAQS.map((item, index) => {
        const isOpen = openIndex === index;
        return (
          <div key={item.q} className="rounded-xl border border-neutral-200 bg-white shadow-sm">
            <button
              type="button"
              onClick={() => setOpenIndex(isOpen ? null : index)}
              className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
              aria-expanded={isOpen}
            >
              <span className="text-sm font-semibold text-neutral-900 md:text-base">{item.q}</span>
              <IconChevronDown className={`h-4 w-4 shrink-0 text-neutral-400 transition-transform ${isOpen ? "rotate-180" : ""}`} />
            </button>
            {isOpen && <p className="px-5 pb-4 text-sm leading-relaxed text-neutral-600">{item.a}</p>}
          </div>
        );
      })}
    </div>
  );
}
