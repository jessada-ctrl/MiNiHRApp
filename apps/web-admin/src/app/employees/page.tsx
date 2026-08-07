"use client";

import { useCallback, useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { getCurrentUser } from "@/lib/auth";
import {
  type Branch,
  type BulkImportResult,
  type Department,
  type Employee,
  type EmployeeQuota,
  type Role,
  type Status,
  bulkImportEmployees,
  createEmployee,
  getEmployeeQuotas,
  listBranches,
  listDepartments,
  listEmployees,
  updateEmployee,
  updateEmployeeQuotas,
} from "@/lib/employees";
import { type LeaveType, listLeaveTypes } from "@/lib/leaveTypes";
import { StatusBadge } from "@/components/ui/Badge";

const ROLE_LABEL: Record<Role, string> = {
  tenant_admin: "ฝ่ายบุคคล",
  approver: "หัวหน้างาน",
  employee: "พนักงาน",
};

const STATUS_LABEL: Record<Status, string> = {
  active: "ทำงานอยู่",
  inactive: "ปิดใช้งาน",
};

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [editingQuota, setEditingQuota] = useState<Employee | null>(null);
  const [canManage, setCanManage] = useState(false);

  useEffect(() => {
    getCurrentUser().then((u) => setCanManage(u?.role === "tenant_admin"));
  }, []);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const [emps, depts, brs] = await Promise.all([listEmployees(), listDepartments(), listBranches()]);
      setEmployees(emps);
      setDepartments(depts);
      setBranches(brs);
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
    <AppShell
      title="พนักงาน"
      actions={
        canManage && (
          <div className="flex gap-2">
            <button
              onClick={() => setShowImport(true)}
              className="rounded-md border border-brand-500 px-4 py-2 text-sm font-medium text-brand-ink transition-colors duration-150 hover:bg-brand-50"
            >
              ⬆ นำเข้าจากไฟล์
            </button>
            <button
              onClick={() => setShowAdd(true)}
              className="rounded-md bg-brand-500 px-4 py-2 text-sm font-medium text-white shadow-e1 transition-colors duration-150 hover:bg-brand-600"
            >
              + เพิ่มพนักงาน
            </button>
          </div>
        )
      }
    >
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">พนักงาน</h1>
        <p className="mt-1 text-sm text-ink-3">
          จัดการโครงสร้างองค์กรและสิทธิ์การใช้งาน — การเปลี่ยนบทบาท สายบังคับบัญชา หรือสถานะ จะถูกบันทึกลง Audit Log
        </p>

        {error && <p className="mt-4 text-sm text-rejected-fg">{error}</p>}

        <div className="mt-4 overflow-x-auto rounded-lg border border-hairline bg-surface shadow-e1">
          <table className="min-w-full divide-y divide-hairline text-sm">
            <thead className="bg-surface-2">
              <tr>
                <Th>พนักงาน</Th>
                <Th>รหัส</Th>
                <Th>แผนก</Th>
                <Th>หัวหน้า</Th>
                <Th>บทบาท</Th>
                <Th>สถานะ</Th>
                <Th></Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {loading && (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-ink-3">
                    กำลังโหลด...
                  </td>
                </tr>
              )}
              {!loading && employees.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-ink-3">
                    ยังไม่มีพนักงาน
                  </td>
                </tr>
              )}
              {employees.map((e) => (
                <tr key={e.id} className={e.status === "inactive" ? "opacity-50" : undefined}>
                  <td className="px-4 py-3 font-medium text-ink">{e.fullName}</td>
                  <td className="px-4 py-3 font-mono text-xs text-ink-3">{e.employeeCode}</td>
                  <td className="px-4 py-3 text-ink-2">{e.department?.departmentName ?? "-"}</td>
                  <td className="px-4 py-3 text-ink-2">{e.directManager?.fullName ?? "-"}</td>
                  <td className="px-4 py-3">
                    <span className="rounded bg-quiet-bg px-2 py-0.5 text-xs font-medium text-ink-2">
                      {ROLE_LABEL[e.role]}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={e.status === "active" ? "approved" : "quiet"}>
                      {STATUS_LABEL[e.status]}
                    </StatusBadge>
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    {canManage ? (
                      <>
                        <button
                          onClick={() => setEditingQuota(e)}
                          className="mr-3 text-sm font-medium text-ink-2 hover:text-ink"
                        >
                          ⚙ โควตา
                        </button>
                        <button
                          onClick={() => setEditing(e)}
                          className="text-sm font-medium text-brand-ink hover:text-brand-ink-strong"
                        >
                          แก้ไข
                        </button>
                      </>
                    ) : (
                      <span className="text-xs text-ink-3">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showAdd && (
        <AddEmployeeModal
          departments={departments}
          branches={branches}
          onClose={() => setShowAdd(false)}
          onCreated={() => {
            setShowAdd(false);
            refresh();
          }}
        />
      )}

      {editing && (
        <EditEmployeeModal
          employee={editing}
          candidates={employees.filter((e) => e.id !== editing.id)}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            refresh();
          }}
        />
      )}

      {editingQuota && (
        <EditQuotaModal employee={editingQuota} onClose={() => setEditingQuota(null)} onSaved={() => setEditingQuota(null)} />
      )}

      {showImport && (
        <ImportEmployeesModal
          onClose={() => setShowImport(false)}
          onDone={() => {
            refresh();
          }}
        />
      )}
    </AppShell>
  );
}

function Th({ children }: { children?: React.ReactNode }) {
  return (
    <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-ink-3">
      {children}
    </th>
  );
}

function AddEmployeeModal({
  departments,
  branches,
  onClose,
  onCreated,
}: {
  departments: Department[];
  branches: Branch[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [employeeCode, setEmployeeCode] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [branchId, setBranchId] = useState("");
  const [role, setRole] = useState<Role>("employee");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await createEmployee({
        employeeCode,
        fullName,
        email,
        departmentId: departmentId || undefined,
        branchId: branchId || undefined,
        role,
      });
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "เพิ่มพนักงานไม่สำเร็จ");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal onClose={onClose} title="เพิ่มพนักงาน">
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <Field label="รหัสพนักงาน">
          <input required value={employeeCode} onChange={(e) => setEmployeeCode(e.target.value)} className={inputCls} />
        </Field>
        <Field label="ชื่อ-นามสกุล">
          <input required value={fullName} onChange={(e) => setFullName(e.target.value)} className={inputCls} />
        </Field>
        <Field label="อีเมล">
          <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} />
        </Field>
        <Field label="แผนก">
          <select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} className={inputCls}>
            <option value="">- ไม่ระบุ -</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.departmentName}
              </option>
            ))}
          </select>
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
        <Field label="บทบาท">
          <select value={role} onChange={(e) => setRole(e.target.value as Role)} className={inputCls}>
            <option value="employee">พนักงาน</option>
            <option value="approver">หัวหน้างาน</option>
            <option value="tenant_admin">ฝ่ายบุคคล</option>
          </select>
        </Field>

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

function EditEmployeeModal({
  employee,
  candidates,
  onClose,
  onSaved,
}: {
  employee: Employee;
  candidates: Employee[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [role, setRole] = useState<Role>(employee.role);
  const [directManagerId, setDirectManagerId] = useState(employee.directManagerId ?? "");
  const [status, setStatus] = useState<Status>(employee.status);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await updateEmployee(employee.id, {
        role,
        directManagerId: directManagerId || null,
        status,
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal onClose={onClose} title={`แก้ไข — ${employee.fullName}`}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <p className="text-xs text-ink-3">
          การเปลี่ยนบทบาท สายบังคับบัญชา หรือสถานะ จะถูกบันทึกลง Audit Log โดยอัตโนมัติ
        </p>
        <Field label="บทบาท">
          <select value={role} onChange={(e) => setRole(e.target.value as Role)} className={inputCls}>
            <option value="employee">พนักงาน</option>
            <option value="approver">หัวหน้างาน</option>
            <option value="tenant_admin">ฝ่ายบุคคล</option>
          </select>
        </Field>
        <Field label="สายบังคับบัญชา (หัวหน้า)">
          <select value={directManagerId} onChange={(e) => setDirectManagerId(e.target.value)} className={inputCls}>
            <option value="">- ไม่มี -</option>
            {candidates.map((c) => (
              <option key={c.id} value={c.id}>
                {c.fullName}
              </option>
            ))}
          </select>
        </Field>
        <Field label="สถานะ">
          <select value={status} onChange={(e) => setStatus(e.target.value as Status)} className={inputCls}>
            <option value="active">ทำงานอยู่</option>
            <option value="inactive">ปิดใช้งาน</option>
          </select>
        </Field>

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

function EditQuotaModal({
  employee,
  onClose,
  onSaved,
}: {
  employee: Employee;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [quotas, setQuotas] = useState<EmployeeQuota[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    getEmployeeQuotas(employee.id)
      .then((qs) => {
        setQuotas(qs);
        setValues(Object.fromEntries(qs.map((q) => [q.leaveTypeId, q.totalDays])));
      })
      .catch((err) => setError(err instanceof Error ? err.message : "โหลดโควตาไม่สำเร็จ"))
      .finally(() => setLoading(false));
  }, [employee.id]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await updateEmployeeQuotas(
        employee.id,
        quotas.map((q) => ({ leaveTypeId: q.leaveTypeId, totalDays: Number(values[q.leaveTypeId]) })),
      );
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal onClose={onClose} title={`แก้ไขโควตา — ${employee.fullName}`}>
      <p className="mb-3 text-xs text-ink-3">
        ปรับเฉพาะพนักงานคนนี้ ไม่กระทบค่ามาตรฐานบริษัท การเปลี่ยนแปลงจะถูกบันทึกลง Audit Log
      </p>
      {loading && <p className="text-sm text-ink-3">กำลังโหลด...</p>}
      {!loading && (
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          {quotas.map((q) => (
            <Field key={q.leaveTypeId} label={`${q.leaveType.name} (วัน/ปี)`}>
              <input
                type="number"
                min={0}
                step={0.5}
                value={values[q.leaveTypeId] ?? ""}
                onChange={(e) => setValues((v) => ({ ...v, [q.leaveTypeId]: e.target.value }))}
                className={inputCls}
              />
            </Field>
          ))}
          {quotas.length === 0 && <p className="text-sm text-ink-3">ยังไม่มีประเภทการลาในระบบ</p>}

          {error && <p className="text-sm text-rejected-fg">{error}</p>}

          <div className="mt-2 flex justify-end gap-2">
            <button type="button" onClick={onClose} className="rounded-md border border-hairline-strong px-4 py-2 text-sm">
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={submitting || quotas.length === 0}
              className="rounded-md bg-brand-500 px-4 py-2 text-sm font-medium text-white shadow-e1 transition-colors duration-150 hover:bg-brand-600 disabled:opacity-60"
            >
              {submitting ? "กำลังบันทึก..." : "บันทึก"}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}

function ImportEmployeesModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [fileName, setFileName] = useState<string | null>(null);
  const [csvText, setCsvText] = useState<string | null>(null);
  const [result, setResult] = useState<BulkImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);

  useEffect(() => {
    listLeaveTypes().then(setLeaveTypes).catch(() => {});
  }, []);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setResult(null);
    setError(null);
    const reader = new FileReader();
    reader.onload = () => setCsvText(String(reader.result ?? ""));
    reader.readAsText(file, "utf-8");
  }

  function downloadTemplate() {
    const quotaCols = leaveTypes.map((t) => `quota:${t.name}`);
    const header = ["employeeCode", "fullName", "email", "phone", "department", "branch", "position", "role", "status", "directManagerEmployeeCode", ...quotaCols].join(",");
    const sampleQuotas = leaveTypes.map((t) => t.defaultQuota).join(",");
    const sample = `EMP100,ชื่อ นามสกุล,emp100@example.com,0812345678,ฝ่ายขาย,,ตำแหน่ง,employee,active,EMP001${quotaCols.length > 0 ? "," + sampleQuotas : ""}`;
    const csv = `${header}\n${sample}\n`;
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "lala-employee-import-template.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function handleImport() {
    if (!csvText) return;
    setError(null);
    setSubmitting(true);
    try {
      const r = await bulkImportEmployees(csvText);
      setResult(r);
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "นำเข้าไม่สำเร็จ");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal onClose={onClose} title="นำเข้าพนักงานจากไฟล์ CSV">
      <div className="flex flex-col gap-3">
        <p className="text-xs text-ink-3">
          คอลัมน์ที่ต้องมี: employeeCode, fullName, email — คอลัมน์อื่น (phone, department, branch, position, role,
          status, directManagerEmployeeCode) ไม่บังคับ พนักงานที่มีรหัสตรงกับข้อมูลเดิมจะถูกอัปเดต ไม่สร้างซ้ำ
          และการเปลี่ยนบทบาท/สายบังคับบัญชา/สถานะ/โควตา จะถูกบันทึกลง Audit Log เป็นรายบุคคล
        </p>
        {leaveTypes.length > 0 && (
          <p className="text-xs text-ink-3">
            กำหนดโควตาเฉพาะรายคนได้ด้วยคอลัมน์ (ไม่บังคับ, ค่าว่าง = ใช้ค่ามาตรฐาน):{" "}
            {leaveTypes.map((t) => `quota:${t.name}`).join(", ")}
          </p>
        )}
        <button type="button" onClick={downloadTemplate} className="self-start text-sm font-medium text-brand-ink hover:text-brand-ink-strong">
          ⬇ ดาวน์โหลดไฟล์ตัวอย่าง
        </button>

        <Field label="ไฟล์ CSV">
          <input type="file" accept=".csv,text/csv" onChange={handleFile} className={inputCls} />
        </Field>
        {fileName && <p className="text-xs text-ink-3">เลือกไฟล์: {fileName}</p>}

        {error && <p className="text-sm text-rejected-fg">{error}</p>}

        {result && (
          <div className="rounded-md border border-hairline bg-surface-2 p-3 text-sm">
            <p className="font-medium text-ink">
              ทั้งหมด {result.totalRows} แถว — สร้างใหม่ {result.created} · อัปเดต {result.updated} · ไม่มีการเปลี่ยนแปลง{" "}
              {result.unchanged} · ผิดพลาด {result.errors.length}
            </p>
            {result.errors.length > 0 && (
              <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-xs text-rejected-fg">
                {result.errors.map((e, i) => (
                  <li key={i}>
                    แถวที่ {e.row} ({e.employeeCode}): {e.message}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="mt-2 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-md border border-hairline-strong px-4 py-2 text-sm">
            ปิด
          </button>
          <button
            type="button"
            onClick={handleImport}
            disabled={!csvText || submitting}
            className="rounded-md bg-brand-500 px-4 py-2 text-sm font-medium text-white shadow-e1 transition-colors duration-150 hover:bg-brand-600 disabled:opacity-60"
          >
            {submitting ? "กำลังนำเข้า..." : "นำเข้า"}
          </button>
        </div>
      </div>
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
  "w-full rounded-md border border-hairline-strong px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500";
