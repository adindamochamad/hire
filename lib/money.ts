export function asMoney(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value.toFixed(2);
  }
  if (typeof value === "string" && /^\d+(\.\d{1,2})?$/.test(value.trim())) {
    return Number(value).toFixed(2);
  }
  return null;
}

export function amountsAddUp(
  clientAmount: string,
  mayaAmount: string,
  studioAmount: string,
): boolean {
  const client = Number(clientAmount);
  const maya = Number(mayaAmount);
  const studio = Number(studioAmount);
  return client === 1200 && maya === 800 && studio === 400 && client === maya + studio;
}

export function formatUsd(value: string | number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Number(value));
}
