/* .env 를 읽어 process.env 에 얹는다. 로컬에서만 쓰인다 —
   Render 에서는 대시보드가 환경변수를 직접 넣어주므로 이 파일이 없어도 된다.
   이거 하나 때문에 의존성을 더 달 이유는 없다. */
"use strict";
const fs = require("fs"), path = require("path");

const file = path.join(__dirname, ".env");
if (fs.existsSync(file)){
  for (const raw of fs.readFileSync(file, "utf8").split(/\r?\n/)){
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i < 0) continue;
    const k = line.slice(0, i).trim();
    let v = line.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
      v = v.slice(1, -1);
    if (!(k in process.env)) process.env[k] = v;    // 이미 있는 값은 덮지 않는다
  }
}
