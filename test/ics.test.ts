import { describe, it, expect } from "vitest";
import { lagIcs } from "../src/lib/ics";
import type { Soknad } from "../src/lib/ferie";

const s = (id: string, fra: string, til: string, merknad = ""): Soknad =>
  ({ id, ansatt_id: "a", fra, til, merknad, status: "godkjent", kommentar: "", behandlet_av: null, behandlet_tid: null, opprettet: "" });

describe("kalenderfil", () => {
  const ics = lagIcs([s("x1", "2027-07-05", "2027-07-23", "Hytta, nås på tlf"), s("x2", "2027-12-27", "2027-12-31")], "Karianne Seth", new Date("2026-10-08T12:00:00Z"));
  it("har riktige heldagshendelser med sluttdato dagen etter", () => {
    expect(ics).toContain("DTSTART;VALUE=DATE:20270705");
    expect(ics).toContain("DTEND;VALUE=DATE:20270724");
    expect(ics).toContain("DTEND;VALUE=DATE:20280101");
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
  });
  it("escaper tekst og bruker CRLF", () => {
    expect(ics).toContain("DESCRIPTION:Hytta\\, nås på tlf");
    expect(ics).toContain("SUMMARY:Ferie – Karianne Seth");
    expect(ics.split("\r\n")[0]).toBe("BEGIN:VCALENDAR");
    expect(ics.split("\r\n").every((l) => l.length <= 75)).toBe(true);
  });
});
