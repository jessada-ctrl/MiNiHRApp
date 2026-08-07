"use client";

import { useCallback, useEffect, useState } from "react";
import QRCode from "qrcode";
import AppShell from "@/components/AppShell";
import { getCurrentUser } from "@/lib/auth";
import {
  type Branch,
  type Department,
  createBranch,
  createDepartment,
  listBranches,
  listDepartments,
  updateBranch,
  updateDepartment,
} from "@/lib/org";
import { type DailyQrCode, generateQrCode, getTodayQrCode } from "@/lib/attendance";

export default function OrganizationPage() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddBranch, setShowAddBranch] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
  const [showAddDept, setShowAddDept] = useState(false);
  const [editingDept, setEditingDept] = useState<Department | null>(null);
  const [canManage, setCanManage] = useState(false);

  useEffect(() => {
    getCurrentUser().then((u) => setCanManage(u?.role === "tenant_admin"));
  }, []);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const [brs, depts] = await Promise.all([listBranches(), listDepartments()]);
      setBranches(brs);
      setDepartments(depts);
    } catch (err) {
      setError(err instanceof Error ? err.message : "โหลดข้อมูลไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <AppShell title="สาขา/แผนก">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">โครงสร้างองค์กร</h1>
        <p className="mt-1 text-sm text-ink-3">
          จัดการสาขา (พร้อมพิกัดและรัศมีสำหรับเช็คอินเข้างาน) และแผนก — การปิดใช้งานจะถูกบันทึกลง Audit Log
        </p>

        {error && <p className="mt-4 text-sm text-rejected-fg">{error}</p>}

        <section className="mt-6">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-ink-2">สาขา</h2>
            {canManage && (
              <button
                onClick={() => setShowAddBranch(true)}
                className="rounded-md bg-brand-500 px-3 py-1.5 text-sm font-medium text-white shadow-e1 transition-colors duration-150 hover:bg-brand-600"
              >
                + เพิ่มสาขา
              </button>
            )}
          </div>
          <div className="mt-3 overflow-x-auto rounded-lg border border-hairline bg-surface shadow-e1">
            <table className="min-w-full divide-y divide-hairline text-sm">
              <thead className="bg-surface-2">
                <tr>
                  <Th>ชื่อสาขา</Th>
                  <Th>ที่อยู่</Th>
                  <Th>พิกัด</Th>
                  <Th>รัศมี (ม.)</Th>
                  <Th>สถานะ</Th>
                  <Th></Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {loading && (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-ink-3">
                      กำลังโหลด...
                    </td>
                  </tr>
                )}
                {!loading && branches.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-ink-3">
                      ยังไม่มีสาขา
                    </td>
                  </tr>
                )}
                {branches.map((b) => (
                  <tr key={b.id} className={!b.isActive ? "opacity-50" : undefined}>
                    <td className="px-4 py-3 font-medium text-ink">{b.branchName}</td>
                    <td className="px-4 py-3 text-ink-2">{b.address ?? "-"}</td>
                    <td className="px-4 py-3 font-mono text-xs text-ink-3">
                      {b.latitude}, {b.longitude}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-ink-2">{b.radiusMeters}</td>
                    <td className="px-4 py-3">
                      <StatusBadge active={b.isActive} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      {canManage ? (
                        <button onClick={() => setEditingBranch(b)} className="text-sm font-medium text-brand-ink hover:text-brand-ink-strong">
                          แก้ไข
                        </button>
                      ) : (
                        <span className="text-xs text-ink-3">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-8">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-ink-2">แผนก</h2>
            {canManage && (
              <button
                onClick={() => setShowAddDept(true)}
                className="rounded-md bg-brand-500 px-3 py-1.5 text-sm font-medium text-white shadow-e1 transition-colors duration-150 hover:bg-brand-600"
              >
                + เพิ่มแผนก
              </button>
            )}
          </div>
          <div className="mt-3 overflow-x-auto rounded-lg border border-hairline bg-surface shadow-e1">
            <table className="min-w-full divide-y divide-hairline text-sm">
              <thead className="bg-surface-2">
                <tr>
                  <Th>ชื่อแผนก</Th>
                  <Th>สาขา</Th>
                  <Th>สถานะ</Th>
                  <Th></Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {loading && (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center text-ink-3">
                      กำลังโหลด...
                    </td>
                  </tr>
                )}
                {!loading && departments.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center text-ink-3">
                      ยังไม่มีแผนก
                    </td>
                  </tr>
                )}
                {departments.map((d) => (
                  <tr key={d.id} className={!d.isActive ? "opacity-50" : undefined}>
                    <td className="px-4 py-3 font-medium text-ink">{d.departmentName}</td>
                    <td className="px-4 py-3 text-ink-2">{d.branch?.branchName ?? "-"}</td>
                    <td className="px-4 py-3">
                      <StatusBadge active={d.isActive} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      {canManage ? (
                        <button onClick={() => setEditingDept(d)} className="text-sm font-medium text-brand-ink hover:text-brand-ink-strong">
                          แก้ไข
                        </button>
                      ) : (
                        <span className="text-xs text-ink-3">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {showAddBranch && (
        <BranchModal
          onClose={() => setShowAddBranch(false)}
          onSaved={() => {
            setShowAddBranch(false);
            refresh();
          }}
        />
      )}
      {editingBranch && (
        <BranchModal
          branch={editingBranch}
          onClose={() => setEditingBranch(null)}
          onSaved={() => {
            setEditingBranch(null);
            refresh();
          }}
        />
      )}
      {showAddDept && (
        <DepartmentModal
          branches={branches}
          onClose={() => setShowAddDept(false)}
          onSaved={() => {
            setShowAddDept(false);
            refresh();
          }}
        />
      )}
      {editingDept && (
        <DepartmentModal
          department={editingDept}
          branches={branches}
          onClose={() => setEditingDept(null)}
          onSaved={() => {
            setEditingDept(null);
            refresh();
          }}
        />
      )}
    </AppShell>
  );
}

function StatusBadge({ active }: { active: boolean }) {
  return (
    <span
      className={`rounded px-2 py-0.5 text-xs font-medium ${active ? "bg-approved-bg text-approved-fg" : "bg-quiet-bg text-quiet-fg"}`}
    >
      {active ? "ใช้งานอยู่" : "ปิดใช้งาน"}
    </span>
  );
}

function Th({ children }: { children?: React.ReactNode }) {
  return (
    <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-ink-3">
      {children}
    </th>
  );
}

function BranchModal({ branch, onClose, onSaved }: { branch?: Branch; onClose: () => void; onSaved: () => void }) {
  const [branchName, setBranchName] = useState(branch?.branchName ?? "");
  const [address, setAddress] = useState(branch?.address ?? "");
  const [latitude, setLatitude] = useState(branch?.latitude ?? "13.7563");
  const [longitude, setLongitude] = useState(branch?.longitude ?? "100.5018");
  const [radiusMeters, setRadiusMeters] = useState(String(branch?.radiusMeters ?? 100));
  const [isActive, setIsActive] = useState(branch?.isActive ?? true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const payload = {
        branchName,
        address: address || undefined,
        latitude: Number(latitude),
        longitude: Number(longitude),
        radiusMeters: Number(radiusMeters),
      };
      if (branch) {
        await updateBranch(branch.id, { ...payload, isActive });
      } else {
        await createBranch(payload);
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal onClose={onClose} title={branch ? `แก้ไขสาขา — ${branch.branchName}` : "เพิ่มสาขา"}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <Field label="ชื่อสาขา">
          <input required value={branchName} onChange={(e) => setBranchName(e.target.value)} className={inputCls} />
        </Field>
        <Field label="ที่อยู่">
          <input value={address} onChange={(e) => setAddress(e.target.value)} className={inputCls} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="ละติจูด (Latitude)">
            <input required type="number" step="0.000001" value={latitude} onChange={(e) => setLatitude(e.target.value)} className={inputCls} />
          </Field>
          <Field label="ลองจิจูด (Longitude)">
            <input required type="number" step="0.000001" value={longitude} onChange={(e) => setLongitude(e.target.value)} className={inputCls} />
          </Field>
        </div>
        <Field label="รัศมีที่อนุญาตเข้างาน (เมตร)">
          <input required type="number" min={1} value={radiusMeters} onChange={(e) => setRadiusMeters(e.target.value)} className={inputCls} />
        </Field>
        {branch && (
          <Field label="สถานะ">
            <select value={isActive ? "active" : "inactive"} onChange={(e) => setIsActive(e.target.value === "active")} className={inputCls}>
              <option value="active">ใช้งานอยู่</option>
              <option value="inactive">ปิดใช้งาน</option>
            </select>
          </Field>
        )}

        {branch && <QrCodeSection branchId={branch.id} />}

        {error && <p className="text-sm text-rejected-fg">{error}</p>}

        <div className="mt-2 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-md border border-hairline-strong px-4 py-2 text-sm">
            ยกเลิก
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-brand-500 px-4 py-2 text-sm font-medium text-white shadow-e1 transition-colors duration-150 hover:bg-brand-600 disabled:opacity-60"
          >
            {submitting ? "กำลังบันทึก..." : "บันทึก"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** FR-4.5: dynamic daily QR code for scan-to-check-in — changes every time HR regenerates it, so a photo of a stale code can't be reused. */
function QrCodeSection({ branchId }: { branchId: string }) {
  const [qrCode, setQrCode] = useState<DailyQrCode | null>(null);
  const [qrImage, setQrImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getTodayQrCode(branchId)
      .then((qr) => {
        if (!cancelled) setQrCode(qr);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "โหลด QR Code ไม่สำเร็จ");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [branchId]);

  // Rendered client-side from the raw token — the LIFF app's scanner reads
  // back exactly this string and sends it to POST /attendance/check as-is,
  // so the QR content must be the bare token, not a wrapping URL.
  useEffect(() => {
    if (!qrCode) return; // nothing to render — the qrCode-less branch below never reads qrImage anyway
    let cancelled = false;
    QRCode.toDataURL(qrCode.qrToken, { width: 180, margin: 1 })
      .then((url) => {
        if (!cancelled) setQrImage(url);
      })
      .catch(() => {
        if (!cancelled) setQrImage(null);
      });
    return () => {
      cancelled = true;
    };
  }, [qrCode]);

  async function handleGenerate() {
    setGenerating(true);
    setError(null);
    try {
      setQrCode(await generateQrCode(branchId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "สร้าง QR Code ไม่สำเร็จ");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="rounded-lg border border-hairline bg-bg p-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-ink-2">QR Code เข้างานประจำวัน</span>
        <button
          type="button"
          onClick={handleGenerate}
          disabled={generating}
          className="rounded-md border border-brand-200 bg-surface px-2.5 py-1 text-xs font-medium text-brand-ink hover:bg-brand-50 disabled:opacity-60"
        >
          {generating ? "กำลังสร้าง..." : qrCode ? "สุ่มรหัสใหม่" : "สร้าง QR Code วันนี้"}
        </button>
      </div>
      {loading ? (
        <p className="mt-2 text-xs text-ink-3">กำลังโหลด...</p>
      ) : qrCode ? (
        <div className="mt-2 flex items-center gap-3">
          {qrImage && (
            // eslint-disable-next-line @next/next/no-img-element -- short-lived data: URL, not worth Next/Image's remote-loader machinery
            <img src={qrImage} alt="QR Code เข้างานวันนี้" width={112} height={112} className="rounded-md border border-hairline bg-surface p-1" />
          )}
          <p className="break-all rounded-md bg-surface px-2 py-1.5 font-mono text-[11px] text-ink-2">{qrCode.qrToken}</p>
        </div>
      ) : (
        <p className="mt-2 text-xs text-ink-3">ยังไม่มี QR Code สำหรับวันนี้ — พนักงานจะใช้พิกัด GPS แทนได้เสมอ</p>
      )}
      {error && <p className="mt-1 text-xs text-rejected-fg">{error}</p>}
      <p className="mt-1 text-[11px] text-ink-3">รหัสจะหมดอายุอัตโนมัติเมื่อขึ้นวันใหม่ หรือเมื่อสุ่มรหัสใหม่</p>
    </div>
  );
}

function DepartmentModal({
  department,
  branches,
  onClose,
  onSaved,
}: {
  department?: Department;
  branches: Branch[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [departmentName, setDepartmentName] = useState(department?.departmentName ?? "");
  const [branchId, setBranchId] = useState(department?.branchId ?? "");
  const [isActive, setIsActive] = useState(department?.isActive ?? true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (department) {
        await updateDepartment(department.id, { departmentName, branchId: branchId || null, isActive });
      } else {
        await createDepartment({ departmentName, branchId: branchId || undefined });
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal onClose={onClose} title={department ? `แก้ไขแผนก — ${department.departmentName}` : "เพิ่มแผนก"}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <Field label="ชื่อแผนก">
          <input required value={departmentName} onChange={(e) => setDepartmentName(e.target.value)} className={inputCls} />
        </Field>
        <Field label="สาขา">
          <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className={inputCls}>
            <option value="">- ไม่ระบุ -</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.branchName}
              </option>
            ))}
          </select>
        </Field>
        {department && (
          <Field label="สถานะ">
            <select value={isActive ? "active" : "inactive"} onChange={(e) => setIsActive(e.target.value === "active")} className={inputCls}>
              <option value="active">ใช้งานอยู่</option>
              <option value="inactive">ปิดใช้งาน</option>
            </select>
          </Field>
        )}

        {error && <p className="text-sm text-rejected-fg">{error}</p>}

        <div className="mt-2 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-md border border-hairline-strong px-4 py-2 text-sm">
            ยกเลิก
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-brand-500 px-4 py-2 text-sm font-medium text-white shadow-e1 transition-colors duration-150 hover:bg-brand-600 disabled:opacity-60"
          >
            {submitting ? "กำลังบันทึก..." : "บันทึก"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-lg bg-surface p-6 shadow-e3">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-lg font-semibold text-ink">{title}</h2>
          <button
            onClick={onClose}
            aria-label="ปิด"
            className="shrink-0 rounded-md p-1 text-ink-3 hover:bg-quiet-bg hover:text-ink-2"
          >
            ✕
          </button>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-ink-2">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

const inputCls =
  "w-full rounded-md border border-hairline-strong px-3 py-2 text-sm focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600";
