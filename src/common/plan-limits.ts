export type PlanType = 'BASIC' | 'PRO' | 'BUSINESS';

export const PLAN_LIMITS: Record<PlanType, {
  employees: number;
  branches: number;
}> = {
  BASIC: {
    employees: 5,
    branches: 1,
  },
  PRO: {
    employees: 10,
    branches: 3,
  },
  BUSINESS: {
    employees: 20,
    branches: 10,
  },
};