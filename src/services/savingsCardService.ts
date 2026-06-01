import { supabase } from "../lib/supabaseClient";
import { getSignedUrl, uploadPrivateFile } from "./storageService";

const receiptsBucket = "payment-receipts-private";

export type SavingsCardStatus = "Activa" | "Completada" | "Canjeada" | "Cancelada";
export type SavingsCardInstallmentStatus = "Pendiente" | "Comprobante enviado" | "En revision" | "Pagado" | "Observado";
export type SavingsCardReceiptStatus = "Comprobante enviado" | "En revision" | "Aprobado" | "Observado";

export type SavingsCardReceiptRow = {
  id: string;
  installment_id: string;
  receipt_path: string;
  submitted_by: string;
  submitted_at: string;
  status: SavingsCardReceiptStatus;
  reviewed_at: string | null;
  reviewed_by: string | null;
  payment_method: string | null;
  admin_notes: string | null;
  created_at: string;
  updated_at: string;
};

export type SavingsCardInstallmentRow = {
  id: string;
  card_id: string;
  installment_number: number;
  due_date: string;
  amount: number;
  status: SavingsCardInstallmentStatus;
  latest_receipt_id: string | null;
  latest_submission_at: string | null;
  latest_reviewed_at: string | null;
  approved_at: string | null;
  approved_by: string | null;
  cash_movement_id: string | null;
  payment_method: string | null;
  admin_notes: string | null;
  created_at: string;
  updated_at: string;
  receipts?: SavingsCardReceiptRow[];
};

export type SavingsCardRedemptionRow = {
  id: string;
  card_id: string;
  treatment_id: string | null;
  treatment_title: string;
  treatment_price: number;
  savings_amount_used: number;
  extra_amount_paid: number;
  payment_method: string | null;
  cash_movement_id: string | null;
  notes: string | null;
  redeemed_by: string | null;
  created_at: string;
  updated_at: string;
};

export type SavingsCardRow = {
  id: string;
  patient_id: string;
  treatment_id: string | null;
  treatment_title: string | null;
  patient_full_name: string;
  patient_document_number: string | null;
  token: string;
  months_count: number;
  monthly_amount: number;
  total_amount: number;
  approved_amount: number;
  pending_amount: number;
  approved_installments_count: number;
  observed_receipts_count: number;
  start_month: string;
  status: SavingsCardStatus;
  notes: string | null;
  activation_message: string | null;
  activated_at: string | null;
  activated_by_profile_id: string | null;
  completed_at: string | null;
  redeemed_at: string | null;
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
  installments?: SavingsCardInstallmentRow[];
  redemption?: SavingsCardRedemptionRow | null;
};

type BaseCardRow = Omit<SavingsCardRow, "installments" | "redemption">;

const cardSelect = "*, patients(id, full_name, document_number, phone, city, profile_id), treatments(id, title, slug)";

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

async function hydrateSavingsCards(baseCards: BaseCardRow[]) {
  if (baseCards.length === 0) return [] as SavingsCardRow[];

  const cardIds = baseCards.map((card) => card.id);

  const { data: installmentRows, error: installmentsError } = await supabase
    .from("savings_card_installments")
    .select("*")
    .in("card_id", cardIds)
    .order("installment_number", { ascending: true });
  if (installmentsError) throw installmentsError;

  const installments = (installmentRows ?? []) as SavingsCardInstallmentRow[];
  const installmentIds = installments.map((row) => row.id);

  const { data: receiptRows, error: receiptsError } =
    installmentIds.length > 0
      ? await supabase
          .from("savings_card_receipts")
          .select("*")
          .in("installment_id", installmentIds)
          .order("submitted_at", { ascending: false })
      : { data: [], error: null as null };
  if (receiptsError) throw receiptsError;

  const { data: redemptionRows, error: redemptionsError } = await supabase
    .from("savings_card_redemptions")
    .select("*")
    .in("card_id", cardIds)
    .order("created_at", { ascending: false });
  if (redemptionsError) throw redemptionsError;

  const receiptsByInstallment = groupByKey((receiptRows ?? []) as SavingsCardReceiptRow[], "installment_id");
  const installmentsByCard = groupByKey(
    installments.map((installment) => ({
      ...installment,
      receipts: receiptsByInstallment.get(installment.id) ?? [],
    })),
    "card_id"
  );
  const redemptionsByCard = groupByKey((redemptionRows ?? []) as SavingsCardRedemptionRow[], "card_id");

  return baseCards.map((card) => ({
    ...card,
    installments: installmentsByCard.get(card.id) ?? [],
    redemption: redemptionsByCard.get(card.id)?.[0] ?? null,
  }));
}

export async function getSavingsCardsAdmin() {
  const { data, error } = await supabase
    .from("savings_cards")
    .select(cardSelect)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return hydrateSavingsCards((data ?? []) as BaseCardRow[]);
}

export async function getSavingsCardByTokenAdmin(token: string) {
  const { data, error } = await supabase
    .from("savings_cards")
    .select(cardSelect)
    .eq("token", token.trim().toUpperCase())
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const rows = await hydrateSavingsCards([data as BaseCardRow]);
  return rows[0] ?? null;
}

export async function getSavingsCardByIdAdmin(cardId: string) {
  const { data, error } = await supabase
    .from("savings_cards")
    .select(cardSelect)
    .eq("id", cardId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const rows = await hydrateSavingsCards([data as BaseCardRow]);
  return rows[0] ?? null;
}

export async function getMySavingsCards() {
  const { data, error } = await supabase
    .from("savings_cards")
    .select(cardSelect)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return hydrateSavingsCards((data ?? []) as BaseCardRow[]);
}

export async function createSavingsCard(input: {
  patientId: string;
  monthsCount: number;
  monthlyAmount: number;
  startMonth: string;
  treatmentId?: string | null;
  treatmentTitle?: string | null;
  notes?: string | null;
}) {
  const { data, error } = await supabase.rpc("create_savings_card", {
    p_patient_id: input.patientId,
    p_months_count: input.monthsCount,
    p_monthly_amount: input.monthlyAmount,
    p_start_month: input.startMonth,
    p_treatment_id: input.treatmentId ?? null,
    p_treatment_title: input.treatmentTitle ?? null,
    p_notes: input.notes ?? null,
  });
  if (error) throw error;
  return getSavingsCardByTokenAdmin((data as SavingsCardRow).token);
}

export async function activateSavingsCardToken(token: string) {
  const { data, error } = await supabase.rpc("activate_savings_card_token", {
    p_token: token.trim().toUpperCase(),
  });
  if (error) throw error;
  return data as SavingsCardRow;
}

export async function uploadSavingsCardReceipt(file: File, installmentId: string) {
  const ext = file.name.split(".").pop() ?? "jpg";
  const path = `savings-cards/${installmentId}/${crypto.randomUUID()}.${ext}`;
  return uploadPrivateFile(receiptsBucket, path, file);
}

export async function submitSavingsCardInstallmentReceipt(installmentId: string, receiptPath: string) {
  const { data, error } = await supabase.rpc("submit_savings_card_installment_receipt", {
    p_installment_id: installmentId,
    p_receipt_path: receiptPath,
  });
  if (error) throw error;
  return data as SavingsCardInstallmentRow;
}

export async function reviewSavingsCardReceipt(input: {
  receiptId: string;
  action: "review" | "approve" | "observe";
  adminNotes?: string | null;
  paymentMethod?: string | null;
}) {
  const { data, error } = await supabase.rpc("review_savings_card_receipt", {
    p_receipt_id: input.receiptId,
    p_action: input.action,
    p_admin_notes: input.adminNotes ?? null,
    p_payment_method: input.paymentMethod ?? null,
  });
  if (error) throw error;
  return data as SavingsCardInstallmentRow;
}

export async function redeemSavingsCard(input: {
  token: string;
  treatmentTitle: string;
  treatmentPrice: number;
  extraAmountPaid: number;
  paymentMethod?: string | null;
  notes?: string | null;
  treatmentId?: string | null;
}) {
  const { data, error } = await supabase.rpc("redeem_savings_card", {
    p_token: input.token.trim().toUpperCase(),
    p_treatment_title: input.treatmentTitle,
    p_treatment_price: input.treatmentPrice,
    p_extra_amount_paid: input.extraAmountPaid,
    p_payment_method: input.paymentMethod ?? null,
    p_notes: input.notes ?? null,
    p_treatment_id: input.treatmentId ?? null,
  });
  if (error) throw error;
  return data as SavingsCardRedemptionRow;
}

export async function getSavingsCardReceiptUrl(path?: string | null) {
  if (!path) return null;
  return getSignedUrl(receiptsBucket, path);
}

export function formatSavingsCardMonth(dateValue?: string | null) {
  if (!dateValue) return "Mes";
  return new Intl.DateTimeFormat("es-BO", {
    month: "long",
    year: "numeric",
    timeZone: "America/La_Paz",
  }).format(new Date(`${dateValue}T00:00:00`));
}

export function buildSavingsCardShareMessage(card: SavingsCardRow) {
  const monthsText = `${card.months_count} mes${card.months_count === 1 ? "" : "es"}`;
  const treatmentText = card.treatment_title?.trim() ? ` para ${card.treatment_title.trim()}` : "";

  return [
    `Hola ${card.patient_full_name}, activamos tu tarjeta de ahorro${treatmentText}.`,
    `Plan: ${monthsText} de Bs ${Number(card.monthly_amount ?? 0).toFixed(2)}.`,
    `Token unico: ${card.token}.`,
    "Ingresa a tu panel privado, abre Tarjetas de ahorro y pega ese token en tu cuenta con el carnet asignado.",
    "Importante: si adelantas pagos, debes subir un comprobante por cada mes para que administracion pueda revisarlo.",
  ].join(" ");
}
