export interface BudgetAllocation {
  accommodation: number | null; // 宿泊費
  transport: number | null; // 交通費
  meals: number | null; // 食事費
  activities: number | null; // アクティビティ・施設入場料
  other: number | null; // その他
}

export interface BudgetPlan extends BudgetAllocation {
  totalBudget: number | null; // 総予算
  planId: string;
}

const STORAGE_KEY = "rs-budget-plans";

export function getBudgetPlan(planId: string): BudgetPlan | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const plans = raw ? JSON.parse(raw) : {};
    return plans[planId] || null;
  } catch {
    return null;
  }
}

function persist(plans: Record<string, BudgetPlan>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(plans));
}

export function saveBudgetPlan(plan: BudgetPlan): BudgetPlan {
  if (typeof window === "undefined") return plan;
  const plans = (() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  })();

  plans[plan.planId] = plan;
  persist(plans);
  return plan;
}

export function deleteBudgetPlan(planId: string): void {
  if (typeof window === "undefined") return;
  const plans = (() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  })();

  delete plans[planId];
  persist(plans);
}

export function calculateBudgetRemaining(plan: BudgetPlan): number | null {
  if (!plan.totalBudget) return null;

  const spent =
    (plan.accommodation || 0) +
    (plan.transport || 0) +
    (plan.meals || 0) +
    (plan.activities || 0) +
    (plan.other || 0);

  return plan.totalBudget - spent;
}

export function calculateBudgetUsagePercent(plan: BudgetPlan): number {
  if (!plan.totalBudget || plan.totalBudget === 0) return 0;

  const spent =
    (plan.accommodation || 0) +
    (plan.transport || 0) +
    (plan.meals || 0) +
    (plan.activities || 0) +
    (plan.other || 0);

  return Math.min(100, Math.round((spent / plan.totalBudget) * 100));
}
