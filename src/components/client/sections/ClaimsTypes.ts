export const CLAIM_TYPE_LABELS: Record<string, string> = {
  delivery_refusal: "Отказ от доставки",
  return:           "Возврат",
  defect:           "Брак",
  damage:           "Повреждение",
};

export const COMP_TYPE_LABELS: Record<string, string> = {
  money:              "Денежная компенсация",
  part_replacement:   "Замена детали",
  back_to_stock:      "Возврат в продажу",
  write_off:          "Списание",
  return_to_supplier: "Возврат поставщику",
};

export interface Claim {
  id: string; claim_number: string; order_number: string; type: string;
  status: string; created_at: string; closed_at: string;
  compensation_amount: number; compensation_type: string;
  product_name: string; description: string;
  photos: string[] | null; decision: string | null;
  history: { date: string; status: string; comment: string }[] | null;
  source: string; client_comment: string | null;
}
