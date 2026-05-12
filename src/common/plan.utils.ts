import { PLAN_LIMITS, PlanType } from './plan-limits';

export function getPlanConfig(plan: string) {
  return PLAN_LIMITS[plan as PlanType] ?? PLAN_LIMITS.BASIC;
}