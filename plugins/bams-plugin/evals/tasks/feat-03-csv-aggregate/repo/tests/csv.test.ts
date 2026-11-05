import { expect, test } from "bun:test";
import { parseCsv } from "../src/csv";

test("quoted comma and escaped quote", () => {
  expect(parseCsv('a,"b,c","d""e"\n1,2,3')).toEqual([["a", "b,c", 'd"e'], ["1", "2", "3"]]);
});
test("CRLF", () => {
  expect(parseCsv("a,b\r\n1,2\r\n")).toEqual([["a", "b"], ["1", "2"]]);
});
