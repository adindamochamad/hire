export function asMoney(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value.toFixed(2);
  }
  if (typeof value === "string" && /^\d+(\.\d{1,2})?$/.test(value.trim())) {
    return Number(value).toFixed(2);
  }
  return null;
}

function toCents(value: string): number | null {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return null;
  return Math.round(amount * 100);
}

export function amountsAddUp(
  clientAmount: string,
  mayaAmount: string,
  studioAmount: string,
): boolean {
  const client = toCents(clientAmount);
  const maya = toCents(mayaAmount);
  const studio = toCents(studioAmount);
  if (client === null || maya === null || studio === null) return false;
  if (client <= 0 || maya < 0 || studio < 0) return false;
  return client === maya + studio;
}

export function formatUsd(value: string | number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Number(value));
}

export function splitCopy(
  clientAmount: string | number,
  mayaAmount: string | number,
  studioAmount: string | number,
): string {
  return `Client pays ${formatUsd(clientAmount)}. Maya receives ${formatUsd(mayaAmount)}. Studio keeps ${formatUsd(studioAmount)}.`;
}
