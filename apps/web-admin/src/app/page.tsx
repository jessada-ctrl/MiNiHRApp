import type { Metadata } from "next";
import Link from "next/link";
import LandingHeader from "@/components/landing/LandingHeader";
import LinePreview from "@/components/landing/LinePreview";
import FaqAccordion from "@/components/landing/FaqAccordion";
import {
  IconArrowRight,
  IconBell,
  IconChart,
  IconCheck,
  IconClock,
  IconFlow,
  IconHome,
  IconLock,
  IconMapPin,
  IconQr,
  IconSend,
  IconShield,
  IconTag,
  IconUsers,
  type IconComponentType,
} from "@/components/landing/icons";

export const metadata: Metadata = {
  title: "LaLa' — จัดการวันลาและเวลาเข้างานผ่าน LINE",
  description:
    "LaLa' คือระบบลาและลงเวลาเข้างานแบบ Multi-Tenant SaaS ที่เชื่อมต่อ LINE Official Account ของบริษัทคุณโดยตรง พร้อมสายอนุมัติ รายงาน และ Audit Log ครบวงจร",
};

const FEATURES: { icon: IconComponentType; title: string; desc: string }[] = [
  {
    icon: IconSend,
    title: "ยื่นคำขอลาผ่าน LINE",
    desc: "พนักงานเลือกประเภทการลา เต็มวัน ครึ่งวัน หรือรายชั่วโมง พร้อมแนบใบรับรองแพทย์ได้ในหน้าแชทเดียว ไม่ต้องติดตั้งแอปเพิ่ม",
  },
  {
    icon: IconQr,
    title: "สแกนเข้า-ออกงาน",
    desc: "รองรับทั้งสแกน QR Code ประจำจุดทำงานและตรวจสอบพิกัด GPS (Geofencing) พร้อมระบบป้องกันการปลอมแปลงตำแหน่ง",
  },
  {
    icon: IconFlow,
    title: "สายอนุมัติแบบลากวาง",
    desc: "ออกแบบขั้นตอนอนุมัติได้เองกี่ขั้นก็ได้ แยกอิสระตามแผนก สาขา หรือประเภทการลา โดยไม่ต้องเขียนโค้ด",
  },
  {
    icon: IconBell,
    title: "แจ้งเตือนอัตโนมัติ",
    desc: "ส่ง Flex Message ตรงถึงหัวหน้างานทันทีที่มีคำขอใหม่ พร้อมทวงถามซ้ำอัตโนมัติทุก 24 ชั่วโมงหากยังไม่มีการพิจารณา",
  },
  {
    icon: IconChart,
    title: "รายงานและ Export",
    desc: "สรุปข้อมูลการลาและเข้างานรายบุคคล รายแผนก หรือรายบริษัท พร้อม Export เป็น Excel และ PDF ได้ทันที",
  },
  {
    icon: IconShield,
    title: "ปลอดภัยระดับองค์กร",
    desc: "แยกข้อมูลแต่ละบริษัทออกจากกัน 100% เข้ารหัสข้อมูลสำคัญด้วย AES-256 และบันทึก Audit Log ที่แก้ไขไม่ได้",
  },
];

const STEPS: { icon: IconComponentType; title: string; desc: string }[] = [
  { icon: IconUsers, title: "ผูกบัญชี LINE", desc: "พนักงานแอด LINE OA บริษัท แล้วยืนยันตัวตนด้วยรหัสพนักงานและ OTP ทางอีเมล" },
  { icon: IconSend, title: "ยื่นคำขอ / สแกนเข้างาน", desc: "เปิดเมนูใน LINE เพื่อยื่นคำขอลาหรือสแกนเข้า-ออกงานได้ทุกที่" },
  { icon: IconCheck, title: "หัวหน้าอนุมัติทันที", desc: "หัวหน้างานตรวจสอบและกดอนุมัติหรือปฏิเสธได้จาก Flex Message บน LINE โดยตรง" },
  { icon: IconHome, title: "HR ดูภาพรวมบนเว็บ", desc: "ฝ่ายบุคคลติดตามสถานะ ออกรายงาน และตรวจสอบ Audit Log จาก Web Dashboard" },
];

const SECURITY_POINTS = [
  { icon: IconLock, title: "Data Isolation 100%", desc: "ทุกคำสั่งฐานข้อมูลถูกกรองด้วย tenant_id โดยอัตโนมัติที่ระดับ Backend ป้องกันข้อมูลรั่วไหลข้ามบริษัท" },
  { icon: IconShield, title: "AES-256 & TLS 1.3", desc: "ข้อมูลส่วนบุคคลและพิกัด GPS เข้ารหัสขณะจัดเก็บ การเชื่อมต่อทั้งหมดผ่าน HTTPS เท่านั้น" },
  { icon: IconTag, title: "Audit Log แก้ไขไม่ได้", desc: "บันทึกทุกการเปลี่ยนสิทธิ์ การปรับโควตา และการเข้าถึงรายงาน พร้อม User, Timestamp และ IP จริง" },
  { icon: IconMapPin, title: "ป้องกันปลอมตำแหน่ง", desc: "ตรวจสอบ LINE Access Token ทุกคำขอ และป้องกันการปลอม GPS สำหรับการลงเวลาเข้างาน" },
];

const PLANS = [
  {
    name: "Starter",
    tagline: "สำหรับทีมขนาดเล็กที่เริ่มต้นย้ายจากกระดาษและ Excel",
    features: ["เชื่อมต่อ LINE OA 1 บัญชี", "ยื่นคำขอลา + สแกนเข้างาน", "สายอนุมัติ 1 ขั้นตอน", "รายงานพื้นฐาน"],
  },
  {
    name: "Business",
    tagline: "สำหรับองค์กรที่มีหลายแผนกและหลายสาขา",
    highlight: true,
    features: ["ทุกอย่างใน Starter", "สายอนุมัติแบบลากวาง ไม่จำกัดขั้นตอน", "Geofencing หลายสาขา + QR รายวัน", "Export Excel / PDF และ Audit Log"],
  },
  {
    name: "Enterprise",
    tagline: "สำหรับกลุ่มบริษัทที่ต้องการ SLA และการดูแลเฉพาะทาง",
    features: ["ทุกอย่างใน Business", "SLA และ Onboarding ทีมงานเฉพาะ", "รองรับจำนวนพนักงานตามสัญญา", "ให้คำปรึกษาการตั้งค่านโยบายการลา"],
  },
];

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col bg-bg">
      <LandingHeader />

      <main className="flex-1">
        {/* Hero */}
        <section className="relative overflow-hidden bg-sidebar">
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute -left-24 top-10 h-72 w-72 rounded-full bg-brand-400/30 blur-[100px]" />
            <div className="absolute right-0 top-40 h-72 w-72 rounded-full bg-gold-500/14 blur-[100px]" />
            <div className="absolute bottom-0 left-1/3 h-72 w-72 rounded-full bg-gold-400/10 blur-[100px]" />
          </div>

          <div className="relative mx-auto grid max-w-6xl gap-12 px-4 py-16 md:grid-cols-2 md:items-center md:px-6 md:py-24">
            <div>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-medium text-gold-300">
                SaaS จัดการวันลา · เชื่อมต่อ LINE OA ของบริษัทคุณ
              </span>
              <h1 className="mt-5 text-3xl font-bold leading-snug text-sidebar-ink sm:text-4xl sm:leading-tight lg:text-[2.6rem]">
                จัดการวันลาและเวลาเข้างาน ผ่าน <span className="text-gold-400">LINE</span>{" "}
                ที่พนักงานใช้อยู่แล้ว
              </h1>
              <p className="mt-5 max-w-xl text-base leading-relaxed text-sidebar-ink-2">
                LaLa&apos; คือระบบลาและลงเวลาเข้างานแบบ Multi-Tenant SaaS พนักงานยื่นคำขอและสแกนเข้างานผ่าน LINE
                หัวหน้าอนุมัติได้ในแชท ส่วนฝ่ายบุคคลบริหารนโยบาย ดูรายงาน และตรวจสอบ Audit Log ได้ครบจากเว็บเดียว
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <a
                  href="#contact"
                  className="inline-flex items-center justify-center gap-1.5 rounded-md bg-gold-500 px-5 py-3 text-sm font-semibold text-brand-900 shadow-e3 shadow-gold-500/25 transition-colors duration-150 hover:bg-gold-400"
                >
                  เริ่มต้นใช้งาน <IconArrowRight className="h-4 w-4" />
                </a>
                <a
                  href="#how-it-works"
                  className="inline-flex items-center justify-center gap-1.5 rounded-md border border-white/20 px-5 py-3 text-sm font-semibold text-sidebar-ink transition-colors duration-150 hover:bg-white/10"
                >
                  ดูวิธีการทำงาน
                </a>
              </div>
              <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-xs text-sidebar-ink-3">
                <span>✓ ไม่ต้องติดตั้งแอปเพิ่ม</span>
                <span>✓ แยกข้อมูลแต่ละบริษัท 100%</span>
                <span>✓ ตั้งค่า LINE OA ของบริษัทเองได้</span>
              </div>
            </div>

            <div className="mx-auto md:mx-0">
              <LinePreview />
            </div>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="mx-auto max-w-6xl px-4 py-20 md:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-2xl font-bold text-ink sm:text-3xl">ทุกอย่างที่ฝ่ายบุคคลต้องใช้ ครบในที่เดียว</h2>
            <p className="mt-3 text-sm text-ink-3 sm:text-base">
              ตั้งแต่พนักงานยื่นคำขอลา ไปจนถึงฝ่ายบุคคลออกรายงานสิ้นเดือน ทำงานต่อเนื่องกันโดยไม่ต้องสลับระบบ
            </p>
          </div>

          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title} className="rounded-lg border border-hairline p-6 transition-shadow hover:shadow-e2">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                  <f.icon className="h-5 w-5" />
                </div>
                <h3 className="mt-4 text-sm font-semibold text-ink">{f.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-ink-3">{f.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section id="how-it-works" className="bg-bg py-20">
          <div className="mx-auto max-w-6xl px-4 md:px-6">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-2xl font-bold text-ink sm:text-3xl">ใช้งานง่าย ครบวงจรใน 4 ขั้นตอน</h2>
              <p className="mt-3 text-sm text-ink-3 sm:text-base">จากแอด LINE ครั้งแรก จนถึงรายงานพร้อมส่งบัญชีเงินเดือน</p>
            </div>

            <div className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
              {STEPS.map((step, i) => (
                <div key={step.title} className="relative rounded-lg bg-surface p-6 shadow-e1">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white">
                      {i + 1}
                    </div>
                    <step.icon className="h-5 w-5 text-brand-ink" />
                  </div>
                  <h3 className="mt-4 text-sm font-semibold text-ink">{step.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-ink-3">{step.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Security */}
        <section id="security" className="relative overflow-hidden bg-sidebar py-20">
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute left-1/4 top-0 h-72 w-72 rounded-full bg-brand-400/14 blur-[120px]" />
          </div>
          <div className="relative mx-auto max-w-6xl px-4 md:px-6">
            <div className="mx-auto max-w-2xl text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-gold-500/15 text-gold-300">
                <IconShield className="h-6 w-6" />
              </div>
              <h2 className="mt-5 text-2xl font-bold text-sidebar-ink sm:text-3xl">ออกแบบให้ปลอดภัยตั้งแต่วันแรก</h2>
              <p className="mt-3 text-sm text-sidebar-ink-2 sm:text-base">
                ระบบ Multi-Tenant ที่แยกข้อมูลแต่ละองค์กรอย่างเข้มงวด เหมาะสำหรับข้อมูลพนักงานที่ต้องการความรัดกุมสูง
              </p>
            </div>

            <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {SECURITY_POINTS.map((p) => (
                <div key={p.title} className="rounded-lg border border-sidebar-line bg-white/5 p-6">
                  <div className="flex h-9 w-9 items-center justify-center rounded-md bg-gold-500/15 text-gold-300">
                    <p.icon className="h-4.5 w-4.5" />
                  </div>
                  <h3 className="mt-4 text-sm font-semibold text-sidebar-ink">{p.title}</h3>
                  <p className="mt-1.5 text-xs leading-relaxed text-sidebar-ink-3">{p.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Pricing */}
        <section id="pricing" className="mx-auto max-w-6xl px-4 py-20 md:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-2xl font-bold text-ink sm:text-3xl">แพ็กเกจที่ปรับตามขนาดองค์กร</h2>
            <p className="mt-3 text-sm text-ink-3 sm:text-base">
              เลือกแพ็กเกจที่เหมาะกับจำนวนพนักงานและความซับซ้อนของสายอนุมัติ ทีมงานช่วยประเมินให้เหมาะสมที่สุด
            </p>
          </div>

          <div className="mt-12 grid gap-6 lg:grid-cols-3">
            {PLANS.map((plan) => (
              <div
                key={plan.name}
                className={`flex flex-col rounded-lg border p-7 ${
                  plan.highlight ? "border-brand-500 bg-brand-50/60 shadow-e3" : "border-hairline"
                }`}
              >
                {plan.highlight && (
                  <span className="mb-3 inline-flex w-fit items-center rounded-full bg-gold-500 px-2.5 py-0.5 text-[11px] font-semibold text-brand-900">
                    แนะนำ
                  </span>
                )}
                <h3 className="text-lg font-bold text-ink">{plan.name}</h3>
                <p className="mt-1.5 text-sm text-ink-3">{plan.tagline}</p>
                <ul className="mt-6 flex flex-1 flex-col gap-3">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm text-ink-2">
                      <IconCheck className="mt-0.5 h-4 w-4 shrink-0 text-brand-ink" />
                      {f}
                    </li>
                  ))}
                </ul>
                <a
                  href="#contact"
                  className={`mt-7 inline-flex items-center justify-center rounded-md px-4 py-2.5 text-sm font-semibold transition-colors duration-150 ${
                    plan.highlight
                      ? "bg-brand-600 text-white hover:bg-brand-700"
                      : "border border-hairline-strong text-ink-2 hover:bg-bg"
                  }`}
                >
                  ติดต่อขอราคา
                </a>
              </div>
            ))}
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="bg-bg py-20">
          <div className="mx-auto max-w-6xl px-4 md:px-6">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-2xl font-bold text-ink sm:text-3xl">คำถามที่พบบ่อย</h2>
            </div>
            <div className="mt-10">
              <FaqAccordion />
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section id="contact" className="mx-auto max-w-6xl px-4 py-16 md:px-6">
          <div className="relative overflow-hidden rounded-3xl bg-sidebar px-6 py-14 text-center sm:px-16">
            <div className="pointer-events-none absolute inset-0">
              <div className="absolute -right-10 -top-10 h-56 w-56 rounded-full bg-gold-500/14 blur-[100px]" />
              <div className="absolute -bottom-10 -left-10 h-56 w-56 rounded-full bg-gold-500/16 blur-[100px]" />
            </div>
            <div className="relative">
              <h2 className="text-2xl font-bold text-sidebar-ink sm:text-3xl">พร้อมให้ LINE จัดการเรื่องลาแทนกระดาษและ Excel แล้วหรือยัง?</h2>
              <p className="mx-auto mt-3 max-w-xl text-sm text-sidebar-ink-2 sm:text-base">
                ทักทีมงาน LaLa&apos; เพื่อขอเดโมและประเมินแพ็กเกจที่เหมาะกับองค์กรของคุณ ไม่มีค่าใช้จ่ายในการปรึกษา
              </p>
              <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <a
                  href="mailto:hello@lala.app"
                  className="inline-flex items-center justify-center gap-1.5 rounded-md bg-gold-500 px-5 py-3 text-sm font-semibold text-brand-900 shadow-e3 shadow-gold-500/25 transition-colors duration-150 hover:bg-gold-400"
                >
                  ติดต่อทีมงาน <IconArrowRight className="h-4 w-4" />
                </a>
                <Link
                  href="/login"
                  className="inline-flex items-center justify-center rounded-md border border-white/20 px-5 py-3 text-sm font-semibold text-sidebar-ink transition-colors duration-150 hover:bg-white/10"
                >
                  เข้าสู่ระบบ
                </Link>
              </div>
              <p className="mt-4 flex items-center justify-center gap-1.5 text-xs text-sidebar-ink-3">
                <IconClock className="h-3.5 w-3.5" /> ตอบกลับภายใน 1 วันทำการ
              </p>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-hairline bg-surface">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:grid-cols-2 md:px-6 lg:grid-cols-4">
          <div>
            <p className="text-lg font-semibold text-ink">
              LaLa<span className="text-gold-700">&apos;</span>
            </p>
            <p className="mt-2 max-w-[220px] text-sm text-ink-3">ระบบลาและลงเวลาเข้างานผ่าน LINE สำหรับ HR ยุคใหม่</p>
          </div>
          <div>
            <p className="text-sm font-semibold text-ink">ผลิตภัณฑ์</p>
            <ul className="mt-3 flex flex-col gap-2 text-sm text-ink-3">
              <li><a href="#features" className="hover:text-brand-ink">ฟีเจอร์</a></li>
              <li><a href="#how-it-works" className="hover:text-brand-ink">วิธีการทำงาน</a></li>
              <li><a href="#security" className="hover:text-brand-ink">ความปลอดภัย</a></li>
              <li><a href="#pricing" className="hover:text-brand-ink">แพ็กเกจ</a></li>
            </ul>
          </div>
          <div>
            <p className="text-sm font-semibold text-ink">บริษัท</p>
            <ul className="mt-3 flex flex-col gap-2 text-sm text-ink-3">
              <li><a href="#faq" className="hover:text-brand-ink">คำถามที่พบบ่อย</a></li>
              <li><a href="#contact" className="hover:text-brand-ink">ติดต่อเรา</a></li>
              <li><Link href="/login" className="hover:text-brand-ink">เข้าสู่ระบบ</Link></li>
            </ul>
          </div>
          <div>
            <p className="text-sm font-semibold text-ink">ติดต่อ</p>
            <ul className="mt-3 flex flex-col gap-2 text-sm text-ink-3">
              <li><a href="mailto:hello@lala.app" className="hover:text-brand-ink">hello@lala.app</a></li>
            </ul>
          </div>
        </div>
        <div className="border-t border-hairline py-5 text-center text-xs text-ink-3">
          © {new Date().getFullYear()} LaLa&apos;. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
