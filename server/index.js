/* ══════════════════════════════════════════════════════════════════════
   미니쇼기 온라인 서버.

   하는 일은 셋뿐이다 — 방을 잡아주고, 수를 심판하고, 사실을 양쪽에 알린다.
   탐색은 하지 않는다. AI 는 클라이언트 워커에 있다. 그래서 이 서버는
   Render 무료 인스턴스에서도 논다.

   HTTP  GET /healthz  깨우기용. 상태를 JSON 으로 돌려준다
         GET /stats    얼마나 뒀는지 집계
         GET /         사람이 열었을 때 볼 한 줄
   WS    /ws           대국
   ══════════════════════════════════════════════════════════════════════ */
"use strict";
require("./env.js");                     // .env 를 먼저 읽는다 (로컬 전용)
const db = require("./db.js");
const http = require("http");
const {WebSocketServer} = require("ws");
const {Room, newCode, LIMIT_MS} = require("./room.js");

const PORT = process.env.PORT || 3000;
const STARTED = Date.now();

/* 방은 메모리에만 둔다. 무료 인스턴스는 영구 디스크가 없고, 재배포하면
   어차피 다 날아간다. 진행 중 대국을 넘기고 싶으면 그때 DB 를 붙인다. */
const rooms = new Map();
const EMPTY_TTL = 10 * 60 * 1000;        // 빈 방은 10분 뒤 치운다

const send = (ws, t, o = {}) => {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify({t, ...o}));
};
function broadcast(room, t, o){
  for (const ws of room.seats) send(ws, t, o);
}
/* 대국이 끝났으면 기보를 남긴다. 실패해도 대국에는 아무 영향이 없다. */
function record(room){
  if (!room.over || room.saved) return;
  room.saved = true;
  db.saveGame({code: room.code, first: room.first, winner: room.over.winner,
               why: room.over.why, plies: room.ply, startedAt: room.startedAt})
    .catch(() => {});
}

function pushState(room){
  const st = room.state();
  for (const ws of room.seats) send(ws, "state", {...st, side: ws ? ws.side : null});
}

/* ─── HTTP ─────────────────────────────────────────────────────────── */
const server = http.createServer((req, res) => {
  const url = (req.url || "/").split("?")[0];

  if (url === "/healthz"){
    let players = 0, playing = 0;
    for (const r of rooms.values()){
      players += (r.seats[0] ? 1 : 0) + (r.seats[1] ? 1 : 0);
      if (r.ready && !r.over) playing++;
    }
    const done = body => {
      res.writeHead(200, {"content-type": "application/json; charset=utf-8",
                          "cache-control": "no-store"});
      res.end(JSON.stringify(body));
    };
    const base = {
      ok: true,
      uptime: Math.round((Date.now() - STARTED) / 1000),
      rooms: rooms.size, players, playing,
      db: db.enabled() ? "on" : "off",
      node: process.version,
    };
    /* DB 가 잠들어 있으면 응답이 늦는다. healthz 는 깨우는 용도라 기다리지 않는다. */
    if (!db.enabled()) return done(base);
    let sent = false;
    const once = extra => { if (!sent){ sent = true; done({...base, ...extra}); } };
    const t = setTimeout(() => once({games: null}), 1500);
    db.count().then(n => { clearTimeout(t); once({games: n}); })
              .catch(() => { clearTimeout(t); once({games: null}); });
    return;
  }

  if (url === "/stats"){
    if (!db.enabled()){
      res.writeHead(503, {"content-type": "application/json; charset=utf-8"});
      return res.end(JSON.stringify({ok: false, why: "db off"}));
    }
    db.stats().then(s => {
      res.writeHead(s ? 200 : 503, {"content-type": "application/json; charset=utf-8",
                                    "cache-control": "no-store"});
      res.end(JSON.stringify(s ? {ok: true, ...s} : {ok: false, why: "db error"}));
    });
    return;
  }

  if (url === "/"){
    res.writeHead(200, {"content-type": "text/plain; charset=utf-8"});
    return res.end("미니쇼기 온라인 서버입니다. 게임은 /healthz 가 아니라 웹 페이지에서 엽니다.\n");
  }

  res.writeHead(404, {"content-type": "text/plain; charset=utf-8"});
  res.end("없는 주소입니다\n");
});

/* ─── WebSocket ────────────────────────────────────────────────────── */
const wss = new WebSocketServer({server, path: "/ws"});

wss.on("connection", ws => {
  ws.alive = true;
  ws.room = null;
  ws.side = null;
  ws.on("pong", () => { ws.alive = true; });

  ws.on("message", raw => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return send(ws, "error", {why: "bad"}); }
    if (!msg || typeof msg.t !== "string") return;

    switch (msg.t){
      case "join":   return onJoin(ws, msg);
      case "move":   return onMove(ws, msg);
      case "resign": return onResign(ws);
      case "rematch":return onRematch(ws);
      default:       return send(ws, "error", {why: "unknown"});
    }
  });

  ws.on("close", () => {
    const room = ws.room;
    if (!room) return;
    room.unseat(ws);
    ws.room = null;
    broadcast(room, "peer", {what: "left"});
  });
});

function onJoin(ws, msg){
  if (ws.room) return send(ws, "error", {why: "joined"});

  let code = typeof msg.code === "string" ? msg.code.trim().toUpperCase() : "";
  let room;
  if (code){
    room = rooms.get(code);
    if (!room) return send(ws, "error", {why: "nocode"});
  } else {
    code = newCode(c => rooms.has(c));
    room = new Room(code);
    room.onTimeout = r => { broadcast(r, "over", r.over); record(r); pushState(r); };
    rooms.set(code, room);
  }

  const got = room.seat(ws, typeof msg.token === "string" ? msg.token : null);
  if (got.err) return send(ws, "error", {why: got.err});

  ws.room = room;
  ws.side = got.side;
  send(ws, "seated", {code: room.code, side: got.side, token: got.token,
                      limit: LIMIT_MS});
  pushState(room);
  const peer = room.seats[1 - got.side];
  if (peer) send(peer, "peer", {what: "joined"});
}

function onMove(ws, msg){
  const room = ws.room;
  if (!room) return send(ws, "error", {why: "noroom"});
  const r = room.play(ws.side, msg.m | 0, msg.ply | 0);
  if (r.err){
    send(ws, "error", {why: r.err});
    return pushState(room);                 // 어긋났으면 진실을 다시 내려준다
  }
  broadcast(room, "moved", {m: r.m, by: ws.side, ply: r.ply, left: r.left});
  if (r.over){ broadcast(room, "over", r.over); record(room); }
  pushState(room);
}

function onResign(ws){
  const room = ws.room;
  if (!room) return;
  const over = room.resign(ws.side);
  if (!over) return;
  broadcast(room, "over", over);
  record(room);
  pushState(room);
}

function onRematch(ws){
  const room = ws.room;
  if (!room) return;
  if (room.wantRematch(ws.side)) broadcast(room, "restart", {});
  else broadcast(room, "peer", {what: "rematch", side: ws.side});
  pushState(room);
}

/* ─── 뒷정리 ───────────────────────────────────────────────────────── */
/* 프록시가 조용한 연결을 끊는다. 30초마다 두드려서 살아있는지 본다 */
setInterval(() => {
  for (const ws of wss.clients){
    if (!ws.alive) { ws.terminate(); continue; }
    ws.alive = false;
    ws.ping();
  }
}, 30000).unref();

setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms){
    if (room.empty && now - room.touched > EMPTY_TTL){
      room.stopClock();
      rooms.delete(code);
    }
  }
}, 60000).unref();

db.init().catch(() => {});               // 첫 손님이 오기 전에 미리 깨워둔다

server.listen(PORT, () => {
  console.log(`미니쇼기 서버 :${PORT}  (healthz → /healthz, 대국 → /ws)`);
});
