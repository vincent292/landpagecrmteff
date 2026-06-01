import { supabase } from "../lib/supabaseClient";
import { getSignedUrl, uploadPrivateFile } from "./storageService";

const receiptsBucket = "payment-receipts-private";

export type PaymentPlanStatus = "Activo" | "Al dia" | "Con atraso" | "Liquidado" | "Cancelado";
export type PaymentPlanInstallmentStatus = "Pendiente" | "Comprobante enviado" | "En revision" | "Pagado" | "Observado";
export type PaymentPlanReceiptStatus = "Comprobante enviado" | "En revision" | "Aprobado" | "Observado";

export type PaymentPlanReceiptRow = {
  id: string;
  installment_id: string;
  receipt_path: string;
  submitted_by: string;
  submitted_at: string;
  payment_date: string;
  status: PaymentPlanReceiptStatus;
  reviewed_at: string | null;
  reviewed_by: string | null;
  payment_method: string | null;
  admin_notes: string | null;
  created_at: string;
  updated_at: string;
};

export type PaymentPlanInstallmentRow = {
  id: string;
  plan_id: string;
  installment_number: number;
  due_date: string;
  amount: number;
  status: PaymentPlanInstallmentStatus;
  latest_receipt_id: string | null;
  latest_submission_at: string | null;
  latest_reviewed_at: string | null;
  latest_payment_date: string | null;
  approved_at: string | null;
  approved_by: string | null;
  cash_movement_id: string | null;
  payment_method: string | null;
  admin_notes: string | null;
  created_at: string;
  updated_at: string;
  receipts?: PaymentPlanReceiptRow[];
};

export type PaymentPlanRow = {
  id: string;
  patient_id: string;
  treatment_id: string | null;
  title: string;
  treatment_title: string | null;
  patient_full_name: string;
  patient_document_number: string | null;
  total_amount: number;
  initial_payment_amount: number;
  financed_amount: number;
  installment_amount: number;
  months_count: number;
  approved_amount: number;
  pending_amount: number;
  approved_installments_count: number;
  observed_receipts_count: number;
  first_due_date: string;
  allow_treatment_before_completion: boolean;
  initial_payment_date: string | null;
  initial_payment_method: string | null;
  initial_payment_cash_movement_id: string | null;
  status: PaymentPlanStatus;
  notes: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  patients?: {
    id: string;
    full_name: string;
    document_number: string | null;
    phone: string | null;
    city: string | null;
    profile_id?: string | null;
  } | null;
  treatments?: {
    id: string;
    title: string;
    slug: string;
  } | null;
  installments?: PaymentPlanInstallmentRow[];
};

type BasePlanRow = Omit<PaymentPlanRow, "installments">;

const planSelect = "*, patients(id, full_name, document_number, phone, city, profile_id), treatments(id, title, slug)";

function groupByKey<T extends { [key: string]: unknown }>(items: T[], key: keyof T) {
  const map = new Map<string, T[]>();
  items.forEach((item) => {
    const bucketKey = String(item[key] ?? "");
    const bucket = map.get(bucketKey) ?? [];
    bucket.push(item);
    map.set(bucketKey, bucket);
  });
  return map;
}

async function hydratePaymentPlans(basePlans: BasePlanRow[]) {
  if (basePlans.length === 0) return [] as PaymentPlanRow[];

  const planIds = basePlans.map((plan) => plan.id);

  const { data: installmentRows, error: installmentsError } = await supabase
    .from("payment_plan_installments")
    .select("*")
    .in("plan_id", planIds)
    .order("installment_number", { ascending: true });
  if (installmentsError) throw installmentsError;

  const installments = (installmentRows ?? []) as PaymentPlanInstallmentRow[];
  const installmentIds = installments.map((row) => row.id);

  const { data: receiptRows, error: receiptsError } =
    installmentIds.length > 0
      ? await supabase
          .from("payment_plan_receipts")
          .select("*")
          .in("installment_id", installmentIds)
          .order("submitted_at", { ascending: false })
      : { data: [], error: null as null };
  if (receiptsError) throw receiptsError;

  const receiptsByInstallment = groupByKey((receiptRows ?? []) as PaymentPlanReceiptRow[], "installment_id");
  const installmentsByPlan = groupByKey(
    installments.map((installment) => ({
      ...installment,
      receipts: receiptsByInstallment.get(installment.id) ?? [],
    })),
    "plan_id"
  );

  return basePlans.map((plan) => ({
    ...plan,
    installments: installmentsByPlan.get(plan.id) ?? [],
  }));
}

export async function getPaymentPlansAdmin() {
  const { data, error } = await supabase
    .from("payment_plans")
    .select(planSelect)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return hydratePaymentPlans((data ?? []) as BasePlanRow[]);
}

export async function getPaymentPlanByIdAdmin(planId: string) {
  const { data, error } = await supabase
    .from("payment_plans")
    .select(planSelect)
    .eq("id", planId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const rows = await hydratePaymentPlans([data as BasePlanRow]);
  return rows[0] ?? null;
}

export async function getMyPaymentPlans() {
  const { data, error } = await supabase
    .from("payment_plans")
    .select(planSelect)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return hydratePaymentPlans((data ?? []) as BasePlanRow[]);
}

export async function createPaymentPlan(input: {
  patientId: string;
  totalAmount: number;
  initialPaymentAmount: number;
  initialPaymentDate?: string | null;
  initialPaymentMethod?: string | null;
  monthsCount: number;
  installmentAmount: number;
  firstDueDate: string;
  allowTreatmentBeforeCompletion: boolean;
  treatmentId?: string | null;
  title?: string | null;
  notes?: string | null;
}) {
  const { data, error } = await supabase.rpc("create_payment_plan", {
    p_patient_id: input.patientId,
    p_total_amount: input.totalAmount,
    p_initial_payment_amount: input.initialPaymentAmount,
    p_initial_payment_date: input.initialPaymentDate ?? null,
    p_initial_payment_method: input.initialPaymentMethod ?? null,
    p_months_count: input.monthsCount,
    p_installment_amount: input.installmentAmount,
    p_first_due_date: input.firstDueDate,
    p_allow_treatment_before_completion: input.allowTreatmentBeforeCompletion,
    p_treatment_id: input.treatmentId ?? null,
    p_title: input.title ?? null,
    p_notes: input.notes ?? null,
  });
  if (error) throw error;
  return getPaymentPlanByIdAdmin((data as PaymentPlanRow).id);
}

export async function uploadPaymentPlanReceipt(file: File, installmentId: string) {
  const ext = file.name.split(".").pop() ?? "jpg";
  const path = `payment-plans/${installmentId}/${crypto.randomUUID()}.${ext}`;
  return uploadPrivateFile(receiptsBucket, path, file);
}

export async function submitPaymentPlanInstallmentReceipt(installmentId: string, receiptPath: string, paymentDate: string) {
  const { data, error } = await supabase.rpc("submit_payment_plan_installment_receipt", {
    p_installment_id: installmentId,
    p_receipt_path: receiptPath,
    p_payment_date: paymentDate,
  });
  if (error) throw error;
  return data as PaymentPlanInstallmentRow;
}

export async function reviewPaymentPlanReceipt(input: {
  receiptId: string;
  action: "review" | "approve" | "observe";
  adminNotes?: string | null;
  paymentMethod?: string | null;
  paymentDate?: string | null;
}) {
  const { data, error } = await supabase.rpc("review_payment_plan_receipt", {
    p_receipt_id: input.receiptId,
    p_action: input.action,
    p_admin_notes: input.adminNotes ?? null,
    p_payment_method: input.paymentMethod ?? null,
    p_payment_date: input.paymentDate ?? null,
  });
  if (error) throw error;
  return data as PaymentPlanInstallmentRow;
}

export async function getPaymentPlanReceiptUrl(path?: string | null) {
  if (!path) return null;
  return getSignedUrl(receiptsBucket, path);
}
