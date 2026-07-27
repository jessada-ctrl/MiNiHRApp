-- CreateEnum
CREATE TYPE "ChatbotLeaveVisibility" AS ENUM ('hr_only', 'hr_and_approver', 'everyone');

-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "chatbot_who_is_on_leave_visibility" "ChatbotLeaveVisibility" NOT NULL DEFAULT 'hr_only';
