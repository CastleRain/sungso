import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { createMemberWork } from "../shared/firebase/member-work.mjs";
import { decideItemWrite, sameItem } from "../apps/wecost/js/wedding-core.mjs";
function setup(initial) {
  let member = { uid: "test-member" },
    fail = false,
    retireOnRead = false,
    writes = 0;
  const docs = new Map(
    initial ? [["wecost_items/test", structuredClone(initial)]] : [],
  );
  const context = vm.createContext({
    createMemberWork,
    decideItemWrite,
    sameItem,
    getMember: () => member,
    registerPrivateCleanup: () => () => {},
    FIREBASE_CONFIG: {},
    getApps: () => [],
    initializeApp: () => ({}),
    getFirestore: () => ({}),
    doc: (_, ...parts) => ({ path: parts.join("/") }),
    serverTimestamp: () => "test-time",
    isTravelItem: () => false,
    runTransaction: async (_, run) => {
      const changes = [];
      await run({
        get: async (ref) => {
          if (retireOnRead) member = null;
          return {
            exists: () => docs.has(ref.path),
            data: () => structuredClone(docs.get(ref.path)),
          };
        },
        set: (ref, data) => changes.push([ref.path, data]),
        update: (ref, data) =>
          changes.push([ref.path, { ...docs.get(ref.path), ...data }]),
        delete: (ref) => changes.push([ref.path, null]),
      });
      if (fail) throw Error("commit failed");
      for (const [key, value] of changes) {
        value ? docs.set(key, value) : docs.delete(key);
        writes++;
      }
    },
  });
  const source = readFileSync(
    new URL("../apps/wecost/js/firebase.js", import.meta.url),
    "utf8",
  )
    .replaceAll("\r\n", "\n")
    .replace(/^import\s[\s\S]*?;\n/gm, "")
    .replace(/^await syncAppAuth\(app\);\n/gm, "")
    .replace(/^export /gm, "");
  vm.runInContext(
    source + ";this.api={addItem,updateItem,deleteItem};",
    context,
  );
  return {
    api: context.api,
    docs,
    get writes() {
      return writes;
    },
    fail: () => {
      fail = true;
    },
    retireOnRead: () => {
      retireOnRead = true;
    },
  };
}
const item = {
  name: "가상 비용",
  cat: "✨기타",
  planned: 100,
  deposit: 10,
  actual: 20,
  balance: 90,
};
test("ordinary wedding save commits once and repeat operation is a no-op", async () => {
  const e = setup(item),
    patch = { actual: 50, balance: 40, weddingOperationId: "op-a" };
  await e.api.updateItem("test", patch, item);
  await e.api.updateItem("test", patch, item);
  assert.equal(e.writes, 1);
  assert.equal(e.docs.get("wecost_items/test").actual, 50);
  await assert.rejects(
    e.api.updateItem("test", { actual: 60, weddingOperationId: "op-b" }, item),
    /다른 기기/,
  );
  assert.equal(e.writes, 1);
});
test("failed transaction preserves existing item and successful create retry never duplicates", async () => {
  const e = setup(item);
  e.fail();
  await assert.rejects(
    e.api.updateItem("test", { actual: 80 }, item),
    /commit failed/,
  );
  assert.deepEqual(e.docs.get("wecost_items/test"), item);
  const added = setup();
  await added.api.addItem(item, "stable-create");
  await added.api.addItem(item, "stable-create");
  assert.equal(added.docs.size, 1);
  assert.equal(added.writes, 1);
  await assert.rejects(
    added.api.addItem({ ...item, actual: 30 }, "stable-create"),
    /이미 저장/,
  );
});
test("changed member and concurrent delete reject before modifying a wedding item", async () => {
  const e = setup(item);
  e.retireOnRead();
  await assert.rejects(
    e.api.updateItem("test", { actual: 50 }, item),
    /계정이 바뀌었어요/,
  );
  assert.equal(e.writes, 0);
  const d = setup({ ...item, memo: "다른 편집" });
  await assert.rejects(d.api.deleteItem("test", item), /다른 기기/);
  assert.equal(d.writes, 0);
  await d.api.deleteItem("test", d.docs.get("wecost_items/test"));
  assert.equal(d.docs.size, 0);
});
