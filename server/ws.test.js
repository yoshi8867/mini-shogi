/* node ws.test.js — 소켓 왕복 검사.
   서버를 실제로 띄우고 두 클라이언트가 한 판을 끝까지 둔다.
   DB 는 끄고 돈다 — 테스트가 진짜 기보를 더럽히면 안 된다. */
"use strict";
const assert = require("assert");
const {spawn} = require("child_process");
const path = require("path");
const WebSocket = require("ws");
const EG = require("../shared/engine.js")();

const PORT = 3987;
const BASE = `http://127.0.0.1:${PORT}`;
const WSU  = `ws://127.0.0.1:${PORT}/ws`;

const wait = ms => new Promise(r => setTimeout(r, ms));

/* 메시지를 종류별로 기다리는 작은 클라이언트 */
function client(){
  const ws = new WebSocket(WSU);
  const box = [];
  const waiters = [];
  ws.on("message", raw => {
    const m = JSON.parse(raw);
    const i = waiters.findIndex(w => w.t === m.t && (!w.pred || w.pred(m)));
    if (i >= 0) waiters.splice(i, 1)[0].go(m);
    else box.push(m);
  });
  return {
    ws,
    open: () => new Promise(r => ws.on("open", r)),
    send: (t, o = {}) => ws.send(JSON.stringify({t, ...o})),
    next(t, ms = 4000, pred = null){
      const i = box.findIndex(m => m.t === t && (!pred || pred(m)));
      if (i >= 0) return Promise.resolve(box.splice(i, 1)[0]);
      return new Promise((go, fail) => {
        const w = {t, pred, go};
        waiters.push(w);
        setTimeout(() => {
          const j = waiters.indexOf(w);
          if (j >= 0){ waiters.splice(j, 1); fail(new Error(`${t} 를 못 받았다`)); }
        }, ms);
      });
    },
    drain(){ box.length = 0; },        // 브로드캐스트 찌꺼기를 버린다
    close: () => ws.close(),
  };
}

(async () => {
  const srv = spawn(process.execPath, [path.join(__dirname, "index.js")], {
    env: {...process.env, PORT: String(PORT), DATABASE_URL: ""},
    stdio: ["ignore", "pipe", "pipe"],
  });
  srv.stdout.on("data", () => {});
  srv.stderr.on("data", d => process.stderr.write(d));
  const bye = code => { try { srv.kill(); } catch {} process.exit(code); };

  try {
    /* ── 1. healthz ─────────────────────────────────────────────────── */
    let up = false;
    for (let i = 0; i < 40 && !up; i++){
      try {
        const r = await fetch(`${BASE}/healthz`);
        const j = await r.json();
        assert.strictEqual(j.ok, true);
        assert.strictEqual(j.db, "off", "테스트인데 DB 가 켜졌다");
        assert.strictEqual(typeof j.uptime, "number");
        up = true;
        console.log(`health  200 · db ${j.db} · node ${j.node}`);
      } catch { await wait(150); }
    }
    assert.ok(up, "서버가 안 떴다");

    const r404 = await fetch(`${BASE}/없는주소`);
    assert.strictEqual(r404.status, 404);

    /* ── 2. 방 만들고 둘이 앉기 ─────────────────────────────────────── */
    const A = client(); await A.open();
    A.send("join", {});
    const seatedA = await A.next("seated");
    assert.strictEqual(seatedA.side, 0);
    assert.match(seatedA.code, /^[A-Z2-9]{4}$/);
    const code = seatedA.code;

    const st0 = await A.next("state");
    assert.strictEqual(st0.ready, false, "혼자인데 준비됐다고 한다");

    const B = client(); await B.open();
    B.send("join", {code});
    const seatedB = await B.next("seated");
    assert.strictEqual(seatedB.side, 1);
    assert.notStrictEqual(seatedB.token, seatedA.token);
    await A.next("peer");
    const st1 = await B.next("state");
    assert.strictEqual(st1.ready, true, "둘인데 준비가 안 됐다");
    assert.strictEqual(st1.turn, 0);
    assert.ok(st1.left > 25000, `시계가 이상하다: ${st1.left}`);
    console.log(`seat    방 ${code} · 두 자리 · 시계 ${Math.round(st1.left/1000)}초`);

    /* ── 3. 없는 방 · 정원 초과 ─────────────────────────────────────── */
    const C = client(); await C.open();
    C.send("join", {code: "ZZZZ"});
    assert.strictEqual((await C.next("error")).why, "nocode");
    C.send("join", {code});
    assert.strictEqual((await C.next("error")).why, "full");
    C.close();
    console.log("guard   없는 방 거절 · 정원 초과 거절");

    /* ── 4. 남의 차례 · 불법 수 거절 ────────────────────────────────── */
    B.send("move", {m: 1, ply: 0});
    assert.strictEqual((await B.next("error")).why, "turn");
    await B.next("state");
    A.send("move", {m: 0x7ffff, ply: 0});
    assert.strictEqual((await A.next("error")).why, "illegal");
    await A.next("state");
    console.log("judge   남의 차례 거절 · 불법 수 거절");
    A.drain(); B.drain();       // 거절 때마다 양쪽에 state 가 뿌려졌다

    /* ── 5. 끝까지 한 판 ────────────────────────────────────────────── */
    const pos = {b: Int8Array.from(st1.b), hand: [st1.hand[0].slice(), st1.hand[1].slice()],
                 turn: st1.turn};
    const seen = new Map([[EG.hash(pos), 1]]);
    let ply = 0, over = null, guard = 0;

    while (!over && guard++ < 300){
      const side = pos.turn, me = side === 0 ? A : B;
      const past = [...seen].filter(e => e[1] >= 2).map(e => e[0]);
      const res = EG.best({b: pos.b, hand: pos.hand, turn: side}, {ms: 25, margin: 140, past});
      me.send("move", {m: res.move, ply});

      /* moved · state · over 는 두 자리 모두에게 간다. 한쪽만 걷으면 다음 판에서 어긋난다 */
      const [mvA, mvB] = await Promise.all([A.next("moved"), B.next("moved")]);
      for (const mv of [mvA, mvB]){
        assert.strictEqual(mv.by, side, "둔 사람이 틀렸다");
        assert.strictEqual(mv.m, res.move, "서버가 다른 수를 확정했다");
        assert.strictEqual(mv.ply, ply + 1, "ply 가 안 맞는다");
      }

      EG.make(pos, res.move);
      ply++;
      const k = EG.hash(pos);
      seen.set(k, (seen.get(k) || 0) + 1);

      const ends = await Promise.all([
        A.next("over", 80).catch(() => null),
        B.next("over", 80).catch(() => null),
      ]);
      await Promise.all([A.next("state"), B.next("state")]);
      assert.deepStrictEqual(ends[0], ends[1], "양쪽이 다른 결과를 받았다");
      over = ends[0];
    }
    assert.ok(over, "300수 안에 안 끝났다");
    assert.ok(["catch","try","repeat","stuck"].includes(over.why), `이상한 종료: ${over.why}`);
    console.log(`play    ${ply}수 만에 ${over.why} · 승자 ${over.winner ?? "무승부"}`);

    /* ── 6. 끝난 판에는 못 둔다 · 재대국 ───────────────────────────── */
    A.send("move", {m: 1, ply});
    assert.strictEqual((await A.next("error")).why, "over");
    A.drain(); B.drain();

    A.send("rematch");
    await Promise.all([A.next("peer"), B.next("peer")]);
    B.send("rematch");
    await Promise.all([A.next("restart"), B.next("restart")]);
    /* 옛 판의 state 가 아직 상자에 남아 있을 수 있다. 새 판인 것을 조건으로 집는다 */
    const fresh = await A.next("state", 4000, s => s.ply === 0);
    assert.strictEqual(fresh.ply, 0, "새 판인데 수가 남아 있다");
    assert.strictEqual(fresh.over, null);
    assert.strictEqual(fresh.first, 1, "선공이 안 넘어갔다");
    assert.strictEqual(fresh.turn, 1);
    console.log("again   끝난 판 거절 · 양쪽 동의로 재대국 · 선공 교대");

    /* ── 7. 새로고침 복귀 ───────────────────────────────────────────── */
    A.close();
    await B.next("peer");
    const A2 = client(); await A2.open();
    A2.send("join", {code, token: seatedA.token});
    const back = await A2.next("seated");
    assert.strictEqual(back.side, 0, "자리표를 들고 왔는데 다른 자리로 갔다");
    assert.strictEqual(back.code, code);
    console.log("rejoin  자리표로 같은 자리 복귀");

    A2.close(); B.close();
    await wait(120);
    console.log("\n전부 통과");
    bye(0);
  } catch (e){
    console.error("\n실패:", e.message);
    bye(1);
  }
})();
