export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ?? "http://127.0.0.1:8000";

/** How long a page will wait for the live API before using the committed snapshot.
 *  The deployed API sleeps on a free tier; a cold wake takes tens of seconds, and a judge who
 *  sees skeletons for that long has already formed an opinion. */
const LIVE_TIMEOUT_MS = 2500;

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LIVE_TIMEOUT_MS);
  try {
    const res = await fetch(url, { cache: "no-store", signal: controller.signal, ...init });
    if (!res.ok) throw new Error(`${url} failed: ${res.status}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * GET with a snapshot fallback.
 *
 * The snapshot is generated from the same committed data by `scripts/build_snapshot.py`, so a
 * fallback render is not stale data — it is the same figures with a slower route to the screen.
 * Callers that need a computed response (targeting, simulation) keep using `apiPost` and show
 * their own loading state.
 */
export async function apiGet<T>(path: string, snapshot?: string): Promise<T> {
  try {
    return await fetchJson<T>(`${API_BASE}${path}`);
  } catch (error) {
    if (!snapshot) throw error;
    const res = await fetch(snapshot, { cache: "force-cache" });
    if (!res.ok) throw error;
    return (await res.json()) as T;
  }
}

/**
 * POSTs drive the interactive pages, so they need a different budget from GETs.
 *
 * The deployed API sleeps on a free tier, and the first request after idle is the one that wakes
 * it: 30–60 s on a cold container, against 4–6 s warm. A short timeout would turn that cold start
 * into a visible failure, so the POST budget is generous. The retry covers the other cold-start
 * failure mode, where the connection is dropped rather than answered — it is deliberately not
 * applied to an HTTP error (a 4xx is a real answer) or to a timeout (retrying doubles a wait the
 * reader is already watching).
 */
const POST_TIMEOUT_MS = 60_000;
const POST_RETRIES = 1;

/** The server answered, and the answer was a failure. */
export class ApiResponseError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiResponseError";
  }
}

/** The request never completed: the engine was asleep, unreachable, or slower than the budget. */
export class ApiTimeoutError extends Error {
  constructor(
    message: string,
    readonly timeoutMs: number,
  ) {
    super(message);
    this.name = "ApiTimeoutError";
  }
}

export type PostOptions = {
  timeoutMs?: number;
  retries?: number;
};

export async function apiPost<T>(
  path: string,
  body: unknown,
  options: PostOptions = {},
): Promise<T> {
  const timeoutMs = options.timeoutMs ?? POST_TIMEOUT_MS;
  const retries = options.retries ?? POST_RETRIES;
  let lastError = new Error(`${path} failed`);

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let aborted = false;
    controller.signal.addEventListener("abort", () => {
      aborted = true;
    });

    try {
      const res = await fetch(`${API_BASE}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        cache: "no-store",
        signal: controller.signal,
      });
      if (!res.ok) {
        const detail = await res.text();
        throw new ApiResponseError(`${path} failed: ${res.status} ${detail}`, res.status);
      }
      return (await res.json()) as T;
    } catch (error) {
      // A real answer, however unhappy: surface it rather than asking again.
      if (error instanceof ApiResponseError) throw error;

      if (aborted) {
        throw new ApiTimeoutError(
          `The analytical engine did not answer within ${Math.round(timeoutMs / 1000)} s.`,
          timeoutMs,
        );
      }

      // Transport failure. Worth one retry: this is the signature of a container waking up.
      lastError = new Error(
        error instanceof Error && error.message
          ? error.message
          : `Could not reach the analytical engine at ${API_BASE}.`,
      );
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError;
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
  /** Which survey round the layer was built from. Read from data/reference/round.json. */
  round: {
    id: string;
    fieldwork: string;
    published: number;
    sample_households: number;
    note: string;
  };
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
  ci95: {
    coverage_of_poor?: [number, number];
    leakage_rate?: [number, number];
    cost_per_poor_reached?: [number, number];
  };
};

export type FairnessRow = {
  districts_reached: number;
  share_to_poorest_decile: number;
  fairness_ratio: number | null;
};

export type TargetingResponse = {
  budget_total: number;
  transfer_per_beneficiary: number;
  sample_households: number;
  total_poor_in_sample: number;
  results: TargetingResult[];
  coverage_curve: Record<string, number>[];
  fairness: Record<string, FairnessRow>;
  bootstrap_reps: number;
  microdata_kind: string;
};

export type FgtMeasures = {
  headcount_pct: number;
  poverty_gap_pct: number;
  severity_pct: number;
};

export type PovertyDistrict = FgtMeasures & {
  district: string;
  province: string;
  sample_households: number;
  published_headcount: number;
};

/** FGT headcount/depth/severity from `/api/poverty`, on the calibrated synthetic layer. */
export type PovertyResponse = {
  scope: string;
  rows: number;
  weights: string;
  lines: {
    total_poverty_line_rwf: number;
    extreme_poverty_line_rwf: number;
    price_base: string;
  };
  national: FgtMeasures & {
    headcount_extreme_pct: number;
    mean_consumption_ae_rwf: number;
    median_consumption_ae_rwf: number;
    gini_consumption: number;
  };
  by_area: ({ area: string } & FgtMeasures)[];
  districts: PovertyDistrict[];
  microdata_kind: string;
  note: string;
};

export type SimulationResponse = {
  district: string;
  province: string;
  shock_type: string;
  shock_label: string;
  severity: number;
  shocks: { id: string; label: string; severity: number }[];
  components: {
    id: string;
    label: string;
    severity: number;
    newly_poor_households: number;
    cash_need_rwf: number;
  }[];
  combined: boolean;
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
  implied_shock_incidence: number;
  severity_note: string;
  microdata_kind: string;
};
