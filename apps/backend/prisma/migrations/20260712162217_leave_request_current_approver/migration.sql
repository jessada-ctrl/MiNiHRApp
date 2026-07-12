-- AlterTable
ALTER TABLE "leave_requests" ADD COLUMN     "current_approver_id" TEXT;

-- CreateIndex
CREATE INDEX "leave_requests_tenant_id_current_approver_id_status_idx" ON "leave_requests"("tenant_id", "current_approver_id", "status");

-- AddForeignKey
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_current_approver_id_fkey" FOREIGN KEY ("current_approver_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;
