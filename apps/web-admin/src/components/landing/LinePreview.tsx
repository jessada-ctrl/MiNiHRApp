import { IconCheck, IconClose } from "./icons";

export default function LinePreview() {
  return (
    <div className="relative mx-auto w-[280px] rounded-[2.25rem] border-[8px] border-sidebar bg-sidebar shadow-2xl sm:w-[300px]">
      <div className="absolute left-1/2 top-0 h-5 w-28 -translate-x-1/2 rounded-b-xl bg-sidebar" />
      <div className="flex h-[560px] flex-col overflow-hidden rounded-[1.6rem] bg-[#e9eef1]">
        <div className="flex items-center gap-2 bg-[#06c755] px-4 py-3 text-white">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20 text-xs font-semibold">HR</div>
          <div className="leading-tight">
            <p className="text-xs font-semibold">LaLa&apos; HR Bot</p>
            <p className="text-[10px] text-white/80">Official Account</p>
          </div>
        </div>

        <div className="flex flex-1 flex-col gap-3 overflow-hidden px-3 py-4">
          <div className="max-w-[85%] rounded-lg rounded-tl-sm bg-white px-3 py-2 text-[11px] text-ink-2 shadow-e1">
            คุณสมชายยื่นคำขอลาใหม่ รอการพิจารณาจากคุณ
          </div>

          <div className="w-[92%] overflow-hidden rounded-lg bg-white shadow-e2">
            <div className="border-b border-hairline bg-line-700 px-4 py-3">
              <p className="text-xs font-semibold text-white">คำขอลาใหม่ 🗓️</p>
            </div>
            <div className="space-y-1.5 px-4 py-3">
              <p className="text-[11px] text-ink-3">
                พนักงาน: <span className="font-medium text-ink">สมชาย ใจดี</span>
              </p>
              <p className="text-[11px] text-ink-3">
                ประเภท: <span className="font-medium text-ink">ลาป่วย (เต็มวัน)</span>
              </p>
              <p className="text-[11px] text-ink-3">
                วันที่: <span className="font-medium text-ink">12–13 ส.ค. 2569</span>
              </p>
              <span className="mt-1 inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                รออนุมัติ
              </span>
            </div>
            <div className="grid grid-cols-2 divide-x divide-hairline border-t border-hairline text-xs font-medium">
              <button type="button" className="flex items-center justify-center gap-1 py-2.5 text-rose-600">
                <IconClose className="h-3.5 w-3.5" /> ปฏิเสธ
              </button>
              <button type="button" className="flex items-center justify-center gap-1 py-2.5 text-emerald-600">
                <IconCheck className="h-3.5 w-3.5" /> อนุมัติ
              </button>
            </div>
          </div>

          <div className="ml-auto max-w-[80%] rounded-lg rounded-tr-sm bg-line-600 px-3 py-2 text-[11px] text-white shadow-e1">
            อนุมัติแล้ว ✅ แจ้งสมชายให้ทราบเรียบร้อย
          </div>
        </div>
      </div>
    </div>
  );
}
