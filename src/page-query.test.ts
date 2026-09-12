import assert from "node:assert/strict";
import { test } from "node:test";

import { attachmentName, pageCount, pageEnvelope, pageQuery } from "./page-query.ts";

test("pageQuery defaults to first page of 10", () => {
  assert.deepEqual(pageQuery({}), { page: 0, pageSize: 10, offset: 0 });
});

test("pageQuery reads page and page_size", () => {
  assert.deepEqual(pageQuery({ page: "2", page_size: "25" }), {
    page: 2,
    pageSize: 25,
    offset: 50,
  });
});

test("pageQuery clamps page_size and ignores junk", () => {
  assert.deepEqual(pageQuery({ page: "-1", page_size: "9999" }), {
    page: 0,
    pageSize: 200,
    offset: 0,
  });
  assert.deepEqual(pageQuery({ page: "x", page_size: "0" }), {
    page: 0,
    pageSize: 1,
    offset: 0,
  });
});

test("pageCount and pageEnvelope describe a slice", () => {
  assert.equal(pageCount(0, 10), 0);
  assert.equal(pageCount(10, 10), 1);
  assert.equal(pageCount(11, 10), 2);
  assert.equal(pageCount(25, 10), 3);

  const first = pageEnvelope(10, 25, 0, 10);
  assert.deepEqual(first, {
    total: 25,
    count: 10,
    page: 0,
    page_size: 10,
    page_count: 3,
  });

  const last = pageEnvelope(5, 25, 2, 10);
  assert.equal(last.count, 5);
  assert.equal(last.page, 2);
  assert.equal(last.page_count, 3);

  const empty = pageEnvelope(0, 0, 0, 10);
  assert.deepEqual(empty, {
    total: 0,
    count: 0,
    page: 0,
    page_size: 10,
    page_count: 0,
  });
});

test("attachmentName keeps a safe filename", () => {
  assert.equal(attachmentName("US-v4"), "US-v4.txt");
  assert.equal(attachmentName("15169/v6"), "15169_v6.txt");
  assert.equal(attachmentName("***"), "addresses.txt");
});
