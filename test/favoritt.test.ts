import { describe, it, expect } from "vitest";
import { hurtigvalg } from "../src/views/Favoritt";
describe("hurtigvalg", () => {
  it("favoritter først, så siste uten dobbelt, maks 8", () => {
    expect(hurtigvalg(["a", "b"], ["b", "c", "d"])).toEqual(["a", "b", "c", "d"]);
    expect(hurtigvalg([], "abcdefghij".split(""))).toHaveLength(8);
  });
});
