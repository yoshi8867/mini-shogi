/* ══════════════════════════════════════════════════════════════════════
   미니쇼기 엔진 — 규칙 한 벌과 알파베타 탐색.

   이 함수 하나가 자기 안에서 완결된다. 그래서
     · 메인 스레드는  const EG = ENGINE();  로 그냥 부르고
     · 워커는         ENGINE.toString()     을 Blob 으로 말아 띄운다
   규칙이 두 벌로 갈라질 일이 없다. UI 의 수 생성도 여기를 거친다.

   판 표현: Int8Array(12), i = r*3 + c, r=0 이 화면 위(후공 진영 끝줄).
     0 = 빈칸, 양수 = 선공(0) 기물, 음수 = 후공(1) 기물
     1 병아리 · 2 코끼리 · 3 기린 · 4 닭 · 5 사자
   손패: hand[side] = [병아리, 코끼리, 기린] 개수. 닭은 잡히면 병아리로 돌아가고
         사자는 잡히는 순간 대국이 끝나므로 손패에 들어오지 않는다.
   ══════════════════════════════════════════════════════════════════════ */
function ENGINE(){
"use strict";

const C=1, E=2, G=3, H=4, L=5;
const BACK=[0,3];                       // 각 진영이 노리는 끝줄
const HSLOT={[C]:0,[E]:1,[G]:2}, HTYPE=[C,E,G];

// (dx,dy) — 선공 기준. 후공은 부호를 뒤집는다.
const STEP={
  [L]:[[0,-1],[1,-1],[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1]],
  [G]:[[0,-1],[1,0],[0,1],[-1,0]],
  [E]:[[1,-1],[1,1],[-1,1],[-1,-1]],
  [C]:[[0,-1]],
  [H]:[[0,-1],[1,-1],[1,0],[0,1],[-1,0],[-1,-1]],
};
// 미리 펼친 이동표. MOVES[side][type][from] = [to, ...]
const MOVES=[[],[]];
for (const side of [0,1]) for (const t of [C,E,G,H,L]){
  MOVES[side][t]=[];
  for (let i=0;i<12;i++){
    const r=(i/3)|0, c=i%3, out=[];
    for (let [dx,dy] of STEP[t]){
      if (side===1){ dx=-dx; dy=-dy; }
      const nr=r+dy, nc=c+dx;
      if (nr>=0&&nr<4&&nc>=0&&nc<3) out.push(nr*3+nc);
    }
    MOVES[side][t][i]=out;
  }
}

/* 수 = 정수 하나.  from | to<<4 | drop<<8 | cap<<12 | promo<<16
   from 은 드롭이면 15 */
const mk=(f,t,d,cap,pr)=>f|(t<<4)|(d<<8)|(cap<<12)|(pr<<16);
const mFrom=m=>m&15, mTo=m=>(m>>4)&15, mDrop=m=>(m>>8)&15,
      mCap=m=>(m>>12)&15, mPromo=m=>(m>>16)&1;

/* ─── 조브리스트: 32비트 두 벌을 53비트 하나로 접는다 ─── */
const rnd=()=>(Math.random()*0x100000000)>>>0;
const ZA=[],ZB=[];
for (let i=0;i<12;i++){ ZA[i]=[]; ZB[i]=[];
  for (let v=0;v<11;v++){ ZA[i][v]=rnd(); ZB[i][v]=rnd(); } }
const ZHA=[[],[]], ZHB=[[],[]];
for (const s of [0,1]) for (let k=0;k<3;k++){ ZHA[s][k]=[]; ZHB[s][k]=[];
  for (let n=0;n<3;n++){ ZHA[s][k][n]=rnd(); ZHB[s][k][n]=rnd(); } }
const ZTA=rnd(), ZTB=rnd();
function hash(p){
  let a=0,b=0;
  for (let i=0;i<12;i++){ const v=p.b[i]+5; a^=ZA[i][v]; b^=ZB[i][v]; }
  for (let s=0;s<2;s++) for (let k=0;k<3;k++){
    const n=p.hand[s][k]; a^=ZHA[s][k][n]; b^=ZHB[s][k][n]; }
  if (p.turn){ a^=ZTA; b^=ZTB; }
  return (a>>>0)*2097152 + ((b>>>0)&0x1FFFFF);
}

/* ─── 수 생성 ─── */
const ML=[], SC=[];                     // 깊이별 버퍼. 노드마다 배열을 만들지 않는다
for (let d=0;d<80;d++){ ML[d]=new Int32Array(64); SC[d]=new Int32Array(64); }

function genInto(p, buf){
  const b=p.b, s=p.turn, sign=s===0?1:-1, back=BACK[s];
  let n=0;
  for (let i=0;i<12;i++){
    const v=b[i];
    if (v===0 || (v>0)!==(s===0)) continue;
    const t=v*sign, tos=MOVES[s][t][i];
    for (let k=0;k<tos.length;k++){
      const j=tos[k], u=b[j];
      if (u!==0 && (u>0)===(s===0)) continue;          // 자기 기물은 못 넘는다
      buf[n++]=mk(i, j, 0, u===0?0:u*-sign,
                  (t===C && ((j/3)|0)===back) ? 1 : 0); // 승격은 강제
    }
  }
  const h=p.hand[s];
  for (let k=0;k<3;k++){
    if (!h[k]) continue;                               // 드롭에 제약은 없다
    for (let j=0;j<12;j++) if (b[j]===0) buf[n++]=mk(15, j, HTYPE[k], 0, 0);
  }
  return n;
}
function make(p,m){
  const s=p.turn, sign=s===0?1:-1, to=mTo(m), d=mDrop(m);
  if (d){ p.b[to]=d*sign; p.hand[s][HSLOT[d]]--; }
  else {
    const f=mFrom(m), cap=mCap(m);
    if (cap) p.hand[s][HSLOT[cap===H?C:cap]]++;        // 닭은 병아리로 돌아간다
    p.b[to]=mPromo(m)?H*sign:p.b[f];
    p.b[f]=0;
  }
  p.turn=1-s;
}
function unmake(p,m){
  const s=1-p.turn, sign=s===0?1:-1, to=mTo(m), d=mDrop(m);
  p.turn=s;
  if (d){ p.b[to]=0; p.hand[s][HSLOT[d]]++; }
  else {
    const f=mFrom(m), cap=mCap(m);
    p.b[f]=mPromo(m)?C*sign:p.b[to];
    p.b[to]=cap?cap*-sign:0;
    if (cap) p.hand[s][HSLOT[cap===H?C:cap]]--;
  }
}
function attacked(p, sq, bySide){
  const b=p.b, sign=bySide===0?1:-1;
  for (let i=0;i<12;i++){
    const v=b[i];
    if (v===0 || (v>0)!==(bySide===0)) continue;
    const tos=MOVES[bySide][v*sign][i];
    for (let k=0;k<tos.length;k++) if (tos[k]===sq) return true;
  }
  return false;
}
/* make() 직후에 부른다 — 이 수로 대국이 끝났는가 (캐치 또는 트라이) */
function decisive(p, m, cap){
  if (cap===L) return true;                            // 캐치
  if (mDrop(m)) return false;                          // 드롭한 사자는 없다
  const s=1-p.turn, to=mTo(m);
  return p.b[to]===(s===0?L:-L)
      && ((to/3)|0)===BACK[s]
      && !attacked(p, to, 1-s);                        // 잡히는 자리면 트라이 아님
}

/* ─── 평가 ─── */
const VAL ={[C]:110,[E]:360,[G]:340,[H]:480,[L]:0};
const HVAL={[C]:130,[E]:400,[G]:380};                  // 손패는 조금 더 친다
const MATE=100000;
function evalPos(p){
  let sc=0;
  for (let i=0;i<12;i++){
    const v=p.b[i]; if (!v) continue;
    const t=v>0?v:-v, side=v>0?0:1, m=side===0?1:-1, r=(i/3)|0;
    const adv = side===0 ? 3-r : r;
    sc += m*VAL[t];
    if (t===L) sc += m*adv*22;                         // 사자 전진 = 트라이 위협
    else if (t===C) sc += m*adv*14;                    // 병아리 전진 = 승격 위협
  }
  for (let s=0;s<2;s++){ const m=s===0?1:-1;
    for (let k=0;k<3;k++) sc += m*p.hand[s][k]*HVAL[HTYPE[k]]; }
  return p.turn===0 ? sc : -sc;
}

/* ─── 탐색 ─── */
let nodes=0, deadline=0, stopped=false;
let TT=new Map();
const KILL=new Int32Array(80);

function search(p, d, a, b, ply, seen){
  if ((nodes++ & 1023)===0 && Date.now()>deadline){ stopped=true; return 0; }
  const k=hash(p), e=TT.get(k);
  if (e && e.d>=d){
    if (e.f===0) return e.v;
    if (e.f===1){ if (e.v>a) a=e.v; }
    else if (e.v<b) b=e.v;
    if (a>=b) return e.v;
  }
  const a0=a, buf=ML[ply], sc=SC[ply], n=genInto(p, buf);
  if (!n) return -MATE+ply;                            // 둘 수 없으면 패배
  const ttm=e?e.m:0, kill=KILL[ply];
  for (let i=0;i<n;i++){
    const m=buf[i];
    sc[i] = m===ttm ? 1e6 : mCap(m) ? 1000+VAL[mCap(m)] : m===kill ? 900 : 0;
  }
  for (let i=1;i<n;i++){                               // 64칸 이하라 삽입정렬로 충분
    const v=sc[i], mm=buf[i]; let j=i-1;
    while (j>=0 && sc[j]<v){ sc[j+1]=sc[j]; buf[j+1]=buf[j]; j--; }
    sc[j+1]=v; buf[j+1]=mm;
  }
  let best=-Infinity, bm=0;
  for (let i=0;i<n;i++){
    const m=buf[i], cap=mCap(m);
    make(p,m);
    let v;
    if (decisive(p,m,cap)) v=MATE-ply;
    else if (d<=1) v=-evalPos(p);
    else {
      const kk=hash(p);
      if (seen.has(kk)) v=0;                           // 반복은 무승부
      else { seen.add(kk); v=-search(p,d-1,-b,-a,ply+1,seen); seen.delete(kk); }
    }
    unmake(p,m);
    if (stopped) return 0;
    if (v>best){ best=v; bm=m; if (v>a) a=v; }
    if (a>=b){ if (!cap) KILL[ply]=m; break; }
  }
  TT.set(k, {d, v:best, m:bm, f: best<=a0 ? 2 : best>=b ? 1 : 0});
  return best;
}

/* 루트는 따로 돈다 — 모든 수의 점수를 남겨야 `보통` 이 차선을 고를 수 있다 */
function best(pos, opt){
  opt = opt || {};
  const ms = opt.ms || 400;
  const p = {b: Int8Array.from(pos.b),
             hand: [pos.hand[0].slice(), pos.hand[1].slice()],
             turn: pos.turn};
  deadline = Date.now()+ms; stopped=false; nodes=0;
  TT = new Map(); KILL.fill(0);

  const root=[], n0=genInto(p, ML[0]);
  for (let i=0;i<n0;i++) root.push({m:ML[0][i], v:-Infinity});
  if (!n0) return {move:0, depth:0, nodes:0, score:-MATE, moves:[]};

  /* 실제 대국에서 이미 지나온 국면 — 여기로 되돌아가면 무승부로 본다 */
  const past = new Set(opt.past || []);
  let depth=0, done=false;

  for (let d=1; d<=60 && !done; d++){
    const scored=[];
    let a=-Infinity;
    for (const r of root){
      const m=r.m, cap=mCap(m);
      make(p,m);
      let v;
      if (decisive(p,m,cap)) v=MATE;
      else {
        const kk=hash(p);
        if (past.has(kk)) v=0;
        else {
          const seen=new Set(past); seen.add(kk);
          v = -search(p, d, -Infinity, -a, 1, seen);
        }
      }
      unmake(p,m);
      if (stopped) break;
      scored.push({m, v});
      if (v>a) a=v;
    }
    if (stopped) break;
    scored.sort((x,y)=>y.v-x.v);
    root.length=0; for (const s of scored) root.push(s);
    depth=d;
    if (Math.abs(scored[0].v) > MATE-200) done=true;   // 승패가 확정됐다
  }

  /* `보통`은 최선만 고집하지 않는다. 다만 이기는 수를 버리거나
     곧장 지는 수를 고르지는 않는다. */
  let pick = root[0];
  const margin = opt.margin|0;
  if (margin > 0 && root[0].v < MATE-200){
    const ok = root.filter(r => r.v >= root[0].v - margin && r.v > -MATE+200);
    if (ok.length) pick = ok[(Math.random()*ok.length)|0];
  }
  return {move:pick.m, score:pick.v, best:root[0].v, depth, nodes,
          moves: root.map(r=>[r.m, r.v])};
}

/* ─── 검사용 ─── */
function perft(pos, d){
  const p={b:Int8Array.from(pos.b),
           hand:[pos.hand[0].slice(),pos.hand[1].slice()], turn:pos.turn};
  const buf=[];
  for (let i=0;i<80;i++) buf[i]=new Int32Array(64);
  const go=(dep,ply)=>{
    if (dep===0) return 1;
    const n=genInto(p, buf[ply]);
    let t=0;
    for (let i=0;i<n;i++){
      const m=buf[ply][i], cap=mCap(m);
      make(p,m);
      t += decisive(p,m,cap) ? 1 : go(dep-1, ply+1);
      unmake(p,m);
    }
    return t;
  };
  return go(d,0);
}
function fresh(){
  const b=new Int8Array(12);
  b[0]=-G; b[1]=-L; b[2]=-E; b[4]=-C;
  b[7]= C; b[9]= E; b[10]= L; b[11]= G;
  return {b, hand:[[0,0,0],[0,0,0]], turn:0};
}

return {
  C, E, G, H, L, BACK, HTYPE, HSLOT, MATE,
  fresh, hash, attacked, perft, best, decisive,
  gen(pos){                              // UI 용 — 편하게 배열로 준다
    const buf=new Int32Array(64), n=genInto(pos, buf), out=[];
    for (let i=0;i<n;i++) out.push(buf[i]);
    return out;
  },
  from:mFrom, to:mTo, drop:mDrop, cap:mCap, promo:mPromo,
};
}
if (typeof module !== "undefined") module.exports = ENGINE;   // node 에서 재볼 때만 쓴다
