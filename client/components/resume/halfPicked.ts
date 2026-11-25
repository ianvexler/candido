/** The fields the browser's own picker has half a month in, which it has alone. */
export const halfPickedMonths = (within = "") =>
  [...document.querySelectorAll<HTMLInputElement>(`${within} input[type="month"]`)].filter((input) => input.validity.badInput);

/**
 * Whether cards with a half-picked month may go. The browser has that alone, so
 * the first time they stay: the entry says so once its field is left.
 */
export const createHalfPickedGate = () => {
  const told = new WeakSet<HTMLInputElement>();
  return () => {
    const found = halfPickedMonths("[data-entry-id]").filter((input) => !told.has(input));
    found.forEach((input) => told.add(input));
    found[0]?.scrollIntoView({ block: "center" });
    return found.length === 0;
  };
};
