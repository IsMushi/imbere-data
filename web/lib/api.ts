export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ?? "http://127.0.0.1:8000";

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`${path} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`${path} failed: ${res.status} ${detail}`);
  }
  return res.json() as Promise<T>;
}

export type District = {
  district: string;
  province: string;
  poverty_2017: number;
  poverty_2024: number;
  poverty_change_pp: number;
  poverty_rank_2024: number;
  population_2022: number;
  households: number;
  poor_people: number;
  poor_households: number;
  stalled_progress: boolean;
  sample_households: number;
  resilience_index: number;
  momo_coverage: number;
  savings_coverage: number;
  insurance_coverage: number;
  shock_incidence: number;
  mean_risk: number;
  financial_health: {
    healthy: number;
    coping: number;
    vulnerable: number;
    extremely_vulnerable: number;
  };
};

export type Indicator = {
  id: string;
  label: string;
  value: number;
  unit: string;
  year: number;
  source: string;
  group: string;
};

export type Meta = {
  country: string;
  poverty_lines: {
    total_poverty_line_rwf_per_adult_equiv_year: number;
    extreme_poverty_line_rwf_per_adult_equiv_year: number;
    price_base: string;
  };
  national: Record<string, number>;
  districts_count: number;
  sources: { id: string; title: string; publisher: string; year: number; url: string; license: string }[];
  indicators: Indicator[];
  province_poverty: {
    province: string;
    poverty_2024: number;
    poverty_2017: number;
    extreme_poverty_2024: number;
    extreme_poverty_2017: number;
  }[];
  area_poverty: { area: string; poverty_2024: number; poverty_2017: number }[];
  shocks: {
    shock_incidence: { all: number; poor: number; non_poor: number };
    shock_types: { id: string; label: string; all: number; poor: number; non_poor: number }[];
    coping_responses: { id: string; label: string; all: number; poor: number; non_poor: number }[];
    finscope_climate: Record<string, number | string>;
  };
  microdata: { kind: string; rows: number; seed: number; note: string };
  model_card: ModelCard;
  calibration: Record<string, number | Record<string, number>>;
  targeting_rules: { id: string; label: string; description: string }[];
  shock_assumptions: Record<string, { label: string; exposure: number; loss: number }>;
  severity_note: string;
};

export type ModelCard = {
  name: string;
  algorithm: string;
  target: string;
  features: string[];
  n_train: number;
  n_test: number;
  auc_gradient_boosting: number;
  auc_logistic_baseline: number;
  importance: { feature: string; key: string; importance: number }[];
  caveat: string;
};

export type TargetingResult = {
  id: string;
  label: string;
  description: string;
  beneficiaries: number;
  poor_reached: number;
  non_poor_reached: number;
  targeting_accuracy: number;
  coverage_of_poor: number;
  leakage_rate: number;
  exclusion_error: number;
  spend_rwf: number;
  cost_per_poor_reached: number | null;
};

export type TargetingResponse = {
  budget_total: number;
  transfer_per_beneficiary: number;
  sample_households: number;
  total_poor_in_sample: number;
  results: TargetingResult[];
  coverage_curve: Record<string, number>[];
  microdata_kind: string;
};

export type SimulationResponse = {
  district: string;
  province: string;
  shock_type: string;
  shock_label: string;
  severity: number;
  district_households: number;
  district_poverty_rate: number;
  result: {
    exposed_households: number;
    newly_poor_households: number;
    newly_poor_people: number;
    newly_extreme_poor_households: number;
    households_below_line_after: number;
    poverty_rate_before: number;
    poverty_rate_after: number;
    mean_consumption_loss_pct: number;
    cash_need_rwf: number;
    cash_need_per_household_rwf: number;
    resilience_index: number;
  };
  compare: { id: string; label: string; newly_poor_households: number; cash_need_rwf: number }[];
  assumptions: Record<string, { label: string; exposure: number; loss: number }>;
  severity_note: string;
  microdata_kind: string;
};
