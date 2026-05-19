export function isCompanyOperational(
  company: any
) {

  return (
    company?.subscriptionStatus ===
      'ACTIVE' ||

    company?.subscriptionStatus ===
      'TRIAL'
  );
}

export function shouldExpireTrial(
  company: any
) {

  return (
    company?.subscriptionStatus ===
      'TRIAL' &&

    company?.trialEnd &&

    new Date(company.trialEnd) <
      new Date()
  );
}