"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
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

export default function OrganizationPage() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddBranch, setShowAddBranch] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
  const [showAddDept, setShowAddDept] = useState(false);
  const [editingDept, setEditingDept] = useState<Department | null>(null);

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
    <main className="min-h-screen bg-neutral-50">
      <header className="flex items-center justify-between border-b border-neutral-200 bg-white px-6 py-4">
        <div className="flex items-center gap-4">
          <Link href="/dashboard" className="text-lg font-semibold text-teal-800">
            MiniHR
          </Link>
          <span className="text-neutral-300">/</span>
          <span className="text-sm text-neutral-600">โครงสร้างองค์กร</span>
        </div>
      </header>

      <div className="p-6">
        <h1 className="text-xl font-semibold text-neutral-900">โครงสร้างองค์กร</h1>
        <p className="mt-1 text-sm text-neutral-500">
          จัดการสาขา (พร้อมพิกัดและรัศมีสำหรับเช็คอินเข้างาน) และแผนก — การปิดใช้งานจะถูกบันทึกลง Audit Log
        </p>

        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

        <section className="mt-6">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-neutral-800">สาขา</h2>
            <button
              onClick={() => setShowAddBranch(true)}
              className="rounded-md bg-teal-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-teal-800"
            >
              + เพิ่มสาขา
            </button>
          </div>
          <div className="mt-3 overflow-x-auto rounded-lg border border-neutral-200 bg-white">
            <table className="min-w-full divide-y divide-neutral-200 text-sm">
              <thead className="bg-neutral-50">
                <tr>
                  <Th>ชื่อสาขา</Th>
                  <Th>ที่อยู่</Th>
                  <Th>พิกัด</Th>
                  <Th>รัศมี (ม.)</Th>
                  <Th>สถานะ</Th>
                  <Th></Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {loading && (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-neutral-400">
                      กำลังโหลด...
                    </td>
                  </tr>
                )}
                {!loading && branches.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-neutral-400">
                      ยังไม่มีสาขา
                    </td>
                  </tr>
                )}
                {branches.map((b) => (
                  <tr key={b.id} className={!b.isActive ? "opacity-50" : undefined}>
                    <td className="px-4 py-3 font-medium text-neutral-900">{b.branchName}</td>
                    <td className="px-4 py-3 text-neutral-600">{b.address ?? "-"}</td>
                    <td className="px-4 py-3 font-mono text-xs text-neutral-500">
                      {b.latitude}, {b.longitude}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-neutral-600">{b.radiusMeters}</td>
                    <td className="px-4 py-3">
                      <StatusBadge active={b.isActive} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => setEditingBranch(b)} className="text-sm font-medium text-teal-700 hover:text-teal-900">
                        แก้ไข
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-8">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-neutral-800">แผนก</h2>
            <button
              onClick={() => setShowAddDept(true)}
              className="rounded-md bg-teal-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-teal-800"
            >
              + เพิ่มแผนก
            </button>
          </div>
          <div className="mt-3 overflow-x-auto rounded-lg border border-neutral-200 bg-white">
            <table className="min-w-full divide-y divide-neutral-200 text-sm">
              <thead className="bg-neutral-50">
                <tr>
                  <Th>ชื่อแผนก</Th>
                  <Th>สาขา</Th>
                  <Th>สถานะ</Th>
                  <Th></Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {loading && (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center text-neutral-400">
                      กำลังโหลด...
                    </td>
                  </tr>
                )}
                {!loading && departments.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center text-neutral-400">
                      ยังไม่มีแผนก
                    </td>
                  </tr>
                )}
                {departments.map((d) => (
                  <tr key={d.id} className={!d.isActive ? "opacity-50" : undefined}>
                    <td className="px-4 py-3 font-medium text-neutral-900">{d.departmentName}</td>
                    <td className="px-4 py-3 text-neutral-600">{d.branch?.branchName ?? "-"}</td>
                    <td className="px-4 py-3">
                      <StatusBadge active={d.isActive} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => setEditingDept(d)} className="text-sm font-medium text-teal-700 hover:text-teal-900">
                        แก้ไข
                      </button>
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
    </main>
  );
}

function StatusBadge({ active }: { active: boolean }) {
  return (
    <span
      className={`rounded px-2 py-0.5 text-xs font-medium ${active ? "bg-green-100 text-green-700" : "bg-neutral-200 text-neutral-600"}`}
    >
      {active ? "ใช้งานอยู่" : "ปิดใช้งาน"}
    </span>
  );
}

function Th({ children }: { children?: React.ReactNode }) {
  return (
    <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500">
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

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="mt-2 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-md border border-neutral-300 px-4 py-2 text-sm">
            ยกเลิก
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-60"
          >
            {submitting ? "กำลังบันทึก..." : "บันทึก"}
          </button>
        </div>
      </form>
    </Modal>
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

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="mt-2 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-md border border-neutral-300 px-4 py-2 text-sm">
            ยกเลิก
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-60"
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-lg">
        <h2 className="text-lg font-semibold text-neutral-900">{title}</h2>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-neutral-700">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

const inputCls =
  "w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600";
