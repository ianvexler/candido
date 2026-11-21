import { describe, expect, it } from "vitest";
import { createSerialQueue } from "./serialQueue";

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => (resolve = done));
  return { promise, resolve };
};

describe("createSerialQueue", () => {
  it("starts each task only after the previous one finishes", async () => {
    const queue = createSerialQueue();
    const order: string[] = [];
    const first = deferred();

    const a = queue.run(async () => {
      order.push("a start");
      await first.promise;
      order.push("a end");
    });
    const b = queue.run(async () => {
      order.push("b start");
    });
    await Promise.resolve();
    expect(order).toEqual(["a start"]);

    first.resolve();
    await Promise.all([a, b]);
    expect(order).toEqual(["a start", "a end", "b start"]);
  });

  it("keeps going after a task fails, and passes the failure to its caller", async () => {
    const queue = createSerialQueue();

    const failing = queue.run(async () => {
      throw new Error("offline");
    });
    const next = queue.run(async () => "saved");

    await expect(failing).rejects.toThrow("offline");
    await expect(next).resolves.toBe("saved");
  });
});
