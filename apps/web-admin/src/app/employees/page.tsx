"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  type Branch,
  type Department,
  type Employee,
  type EmployeeQuota,
  type Role,
  type Status,
  createEmployee,
  getEmployeeQuotas,
  listBranches,
  listDepartments,
  listEmployees,
  updateEmployee,
  updateEmployeeQuotas,
} from "@/lib/employees";

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
  const [editing, setEditing] = useState<Employee | null>(null);
  const [editingQuota, setEditingQuota] = useState<Employee | null>(null);

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
    <main className="min-h-screen bg-neutral-50">
      <header className="flex items-center justify-between border-b border-neutral-200 bg-white px-6 py-4">
        <div className="flex items-center gap-4">
          <Link href="/dashboard" className="text-lg font-semibold text-teal-800">
            MiniHR
          </Link>
          <span className="text-neutral-300">/</span>
          <span className="text-sm text-neutral-600">พนักงาน</span>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="rounded-md bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800"
        >
          + เพิ่มพนักงาน
        </button>
      </header>

      <div className="p-6">
        <h1 className="text-xl font-semibold text-neutral-900">พนักงาน</h1>
        <p className="mt-1 text-sm text-neutral-500">
          จัดการโครงสร้างองค์กรและสิทธิ์การใช้งาน — การเปลี่ยนบทบาท สายบังคับบัญชา หรือสถานะ จะถูกบันทึกลง Audit Log
        </p>

        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

        <div className="mt-4 overflow-x-auto rounded-lg border border-neutral-200 bg-white">
          <table className="min-w-full divide-y divide-neutral-200 text-sm">
            <thead className="bg-neutral-50">
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
            <tbody className="divide-y divide-neutral-100">
              {loading && (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-neutral-400">
                    กำลังโหลด...
                  </td>
                </tr>
              )}
              {!loading && employees.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-neutral-400">
                    ยังไม่มีพนักงาน
                  </td>
                </tr>
              )}
              {employees.map((e) => (
                <tr key={e.id} className={e.status === "inactive" ? "opacity-50" : undefined}>
                  <td className="px-4 py-3 font-medium text-neutral-900">{e.fullName}</td>
                  <td className="px-4 py-3 font-mono text-xs text-neutral-500">{e.employeeCode}</td>
                  <td className="px-4 py-3 text-neutral-600">{e.department?.departmentName ?? "-"}</td>
                  <td className="px-4 py-3 text-neutral-600">{e.directManager?.fullName ?? "-"}</td>
                  <td className="px-4 py-3">
                    <span className="rounded bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-700">
                      {ROLE_LABEL[e.role]}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded px-2 py-0.5 text-xs font-medium ${
                        e.status === "active" ? "bg-green-100 text-green-700" : "bg-neutral-200 text-neutral-600"
                      }`}
                    >
                      {STATUS_LABEL[e.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <button
                      onClick={() => setEditingQuota(e)}
                      className="mr-3 text-sm font-medium text-neutral-600 hover:text-neutral-900"
                    >
                      ⚙ โควตา
                    </button>
                    <button
                      onClick={() => setEditing(e)}
                      className="text-sm font-medium text-teal-700 hover:text-teal-900"
                    >
                      แก้ไข
                    </button>
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
    </main>
  );
}

function Th({ children }: { children?: React.ReactNode }) {
  return (
    <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500">
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
        <p className="text-xs text-neutral-500">
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
      <p className="mb-3 text-xs text-neutral-500">
        ปรับเฉพาะพนักงานคนนี้ ไม่กระทบค่ามาตรฐานบริษัท การเปลี่ยนแปลงจะถูกบันทึกลง Audit Log
      </p>
      {loading && <p className="text-sm text-neutral-400">กำลังโหลด...</p>}
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
          {quotas.length === 0 && <p className="text-sm text-neutral-400">ยังไม่มีประเภทการลาในระบบ</p>}

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="mt-2 flex justify-end gap-2">
            <button type="button" onClick={onClose} className="rounded-md border border-neutral-300 px-4 py-2 text-sm">
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={submitting || quotas.length === 0}
              className="rounded-md bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-60"
            >
              {submitting ? "กำลังบันทึก..." : "บันทึก"}
            </button>
          </div>
        </form>
      )}
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
