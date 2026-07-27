"use client";

import { useCallback, useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { type Employee, listEmployees } from "@/lib/employees";
import {
  type ApproverType,
  type ScopeType,
  type StepInput,
  type Workflow,
  createWorkflow,
  deleteWorkflow,
  listWorkflows,
  updateWorkflowSteps,
} from "@/lib/workflows";

const SCOPE_LABEL: Record<ScopeType, string> = {
  global: "ทุกแผนก/ทุกประเภทการลา",
  department: "ตามแผนก",
  branch: "ตามสาขา",
  leave_type: "ตามประเภทการลา",
};

export default function WorkflowsPage() {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const [wfs, emps] = await Promise.all([listWorkflows(), listEmployees()]);
      setWorkflows(wfs);
      setEmployees(emps);
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
      title="สายอนุมัติ"
      actions={
        <button
          onClick={() => setShowAdd(true)}
          className="rounded-md bg-sky-700 px-4 py-2 text-sm font-medium text-white hover:bg-sky-800"
        >
          + สร้างสายอนุมัติ
        </button>
      }
    >
      <div>
        <h1 className="text-xl font-semibold text-neutral-900">สายอนุมัติ (Approval Workflow Builder)</h1>
        <p className="mt-1 text-sm text-neutral-500">ลากบล็อกเพื่อสลับลำดับขั้นตอน แล้วกดบันทึกในแต่ละสาย</p>

        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
        {loading && <p className="mt-4 text-sm text-neutral-400">กำลังโหลด...</p>}

        <div className="mt-4 flex flex-col gap-6">
          {!loading &&
            workflows.map((wf) => (
              <WorkflowCard key={wf.id} workflow={wf} employees={employees} onChanged={refresh} />
            ))}
          {!loading && workflows.length === 0 && (
            <p className="text-sm text-neutral-400">ยังไม่มีสายอนุมัติ — กด &quot;สร้างสายอนุมัติ&quot; เพื่อเริ่มต้น</p>
          )}
        </div>
      </div>

      {showAdd && (
        <AddWorkflowModal
          onClose={() => setShowAdd(false)}
          onCreated={() => {
            setShowAdd(false);
            refresh();
          }}
        />
      )}
    </AppShell>
  );
}

const APPROVER_TYPE_LABEL: Record<ApproverType, string> = {
  direct_manager: "หัวหน้างานตรง (Direct Manager)",
  specific_employee: "พนักงานที่ระบุ",
};

function WorkflowCard({
  workflow,
  employees,
  onChanged,
}: {
  workflow: Workflow;
  employees: Employee[];
  onChanged: () => void;
}) {
  const [steps, setSteps] = useState<StepInput[]>(
    workflow.steps.map((s) => ({ approverType: s.approverType, approverEmployeeId: s.approverEmployeeId ?? undefined })),
  );
  const [dirty, setDirty] = useState(false);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSteps(workflow.steps.map((s) => ({ approverType: s.approverType, approverEmployeeId: s.approverEmployeeId ?? undefined })));
    setDirty(false);
  }, [workflow]);

  function move(from: number, to: number) {
    if (from === to) return;
    setSteps((prev) => {
      const next = [...prev];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
    setDirty(true);
  }

  function updateStep(idx: number, patch: Partial<StepInput>) {
    setSteps((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
    setDirty(true);
  }

  function addStep() {
    setSteps((prev) => [...prev, { approverType: "direct_manager" }]);
    setDirty(true);
  }

  function removeStep(idx: number) {
    setSteps((prev) => prev.filter((_, i) => i !== idx));
    setDirty(true);
  }

  async function handleSave() {
    setError(null);
    for (const s of steps) {
      if (s.approverType === "specific_employee" && !s.approverEmployeeId) {
        setError("ทุกขั้นตอนที่เลือก \"พนักงานที่ระบุ\" ต้องเลือกชื่อพนักงานด้วย");
        return;
      }
    }
    setSaving(true);
    try {
      await updateWorkflowSteps(workflow.id, steps);
      setDirty(false);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    try {
      await deleteWorkflow(workflow.id);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "ลบไม่สำเร็จ");
    }
  }

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-neutral-900">{workflow.name}</h2>
          <p className="text-xs text-neutral-500">{SCOPE_LABEL[workflow.scopeType]}</p>
        </div>
        <button onClick={handleDelete} className="text-sm font-medium text-red-600 hover:text-red-800">
          ลบสายอนุมัติ
        </button>
      </div>

      <div className="mt-4 flex flex-wrap items-stretch gap-3">
        {steps.map((step, idx) => (
          <div key={idx} className="flex items-stretch gap-3">
            <div
              draggable
              onDragStart={() => setDragIdx(idx)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (dragIdx !== null) move(dragIdx, idx);
                setDragIdx(null);
              }}
              className="flex w-56 cursor-grab flex-col gap-2 rounded-lg border border-neutral-300 bg-neutral-50 p-3 active:cursor-grabbing"
            >
              <span className="w-fit rounded-full bg-sky-100 px-2 py-0.5 text-xs font-semibold text-sky-800">
                ขั้นที่ {idx + 1}
              </span>
              <select
                value={step.approverType}
                onChange={(e) => updateStep(idx, { approverType: e.target.value as ApproverType, approverEmployeeId: undefined })}
                className="w-full rounded-md border border-neutral-300 px-2 py-1 text-sm"
              >
                <option value="direct_manager">{APPROVER_TYPE_LABEL.direct_manager}</option>
                <option value="specific_employee">{APPROVER_TYPE_LABEL.specific_employee}</option>
              </select>
              {step.approverType === "specific_employee" && (
                <select
                  value={step.approverEmployeeId ?? ""}
                  onChange={(e) => updateStep(idx, { approverEmployeeId: e.target.value })}
                  className="w-full rounded-md border border-neutral-300 px-2 py-1 text-sm"
                >
                  <option value="">- เลือกพนักงาน -</option>
                  {employees.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.fullName}
                    </option>
                  ))}
                </select>
              )}
              {steps.length > 1 && (
                <button
                  onClick={() => removeStep(idx)}
                  className="self-end text-xs font-medium text-red-600 hover:text-red-800"
                >
                  ✕ ลบขั้นตอน
                </button>
              )}
            </div>
            {idx < steps.length - 1 && <span className="self-center text-xl text-neutral-300">→</span>}
          </div>
        ))}
        <button
          onClick={addStep}
          className="flex w-40 items-center justify-center rounded-lg border border-dashed border-neutral-300 text-sm font-medium text-neutral-500 hover:border-sky-400 hover:text-sky-700"
        >
          + เพิ่มขั้นตอน
        </button>
      </div>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      {dirty && (
        <div className="mt-4 flex items-center gap-2">
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-md bg-sky-700 px-4 py-2 text-sm font-medium text-white hover:bg-sky-800 disabled:opacity-60"
          >
            {saving ? "กำลังบันทึก..." : "บันทึกสายอนุมัตินี้"}
          </button>
          <span className="text-xs text-neutral-400">มีการเปลี่ยนแปลงยังไม่ได้บันทึก</span>
        </div>
      )}
    </div>
  );
}

function AddWorkflowModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState("");
  const [scopeType, setScopeType] = useState<ScopeType>("global");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await createWorkflow({ name, scopeType, steps: [{ approverType: "direct_manager" }] });
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "สร้างสายอนุมัติไม่สำเร็จ");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-lg">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-lg font-semibold text-neutral-900">สร้างสายอนุมัติ</h2>
          <button
            onClick={onClose}
            aria-label="ปิด"
            className="shrink-0 rounded-md p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600"
          >
            ✕
          </button>
        </div>
        <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-3">
          <label className="block">
            <span className="block text-sm font-medium text-neutral-700">ชื่อสายอนุมัติ</span>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="block text-sm font-medium text-neutral-700">ขอบเขต</span>
            <select
              value={scopeType}
              onChange={(e) => setScopeType(e.target.value as ScopeType)}
              className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
            >
              {Object.entries(SCOPE_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <p className="text-xs text-neutral-500">เริ่มต้นด้วย 1 ขั้นตอน (หัวหน้างานตรง) — เพิ่ม/แก้ไขขั้นตอนได้หลังสร้างแล้ว</p>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="mt-2 flex justify-end gap-2">
            <button type="button" onClick={onClose} className="rounded-md border border-neutral-300 px-4 py-2 text-sm">
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-md bg-sky-700 px-4 py-2 text-sm font-medium text-white hover:bg-sky-800 disabled:opacity-60"
            >
              {submitting ? "กำลังสร้าง..." : "สร้าง"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
