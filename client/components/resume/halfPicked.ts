/**
 * Whether cards with a half-picked month may go. The browser has that alone, so
 * the first time they stay: the entry says so once its field is left.
 */
export const createHalfPickedGate = () => {
  const told = new WeakSet<HTMLInputElement>();
  return () => {
    const found = [...document.querySelectorAll<HTMLInputElement>('[data-entry-id] input[type="month"]')].filter(
      (input) => input.validity.badInput && !told.has(input)
    );
    found.forEach((input) => told.add(input));
    found[0]?.scrollIntoView({ block: "center" });
    return found.length === 0;
  };
};
