#!/usr/bin/env node
// A-task v4: case-normalize + user-defined exclusion + noun-keyword classifier
// (2026-05-27, final version)
//
// Pipeline:
//   1. Grep raw sq_* identifiers (483 case-sensitive in our snapshot)
//   2. Exclude user-defined `function sq_X(...)` declarations (5 names, 269 calls)
//   3. Case-normalize remaining (478 → 443)
//   4. Classify by noun-keyword regex (22 system buckets + 99-Unclassified)
//
// Skepticism principle: each bucket rule audited against .nut call context
// before being added. See nut-validation-2026-05-27.md §十 for audit log.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

const txt = fs.readFileSync(path.join(HERE, 'all-193.jsonl'), 'utf8');
const parts = txt.split(/\n?---\n?/).filter(s => s.trim());

// Step 1+2: extract user-defined function names, then exclude
const userDefined = new Set();
for (const p of parts) {
  try {
    const j = JSON.parse(p);
    if (j.type !== 'text' || !j.content) continue;
    const m = j.content.matchAll(/(?:^|\n)\s*function\s+(sq_[A-Za-z_]+)\s*\(/g);
    for (const x of m) userDefined.add(x[1].toLowerCase());
  } catch {}
}

const raw = fs.readFileSync(path.join(HERE, 'sq-api-frequency.txt'), 'utf8').trim().split('\n');
const apis = raw
  .map(l => { const m = l.trim().match(/^(\d+)\s+(sq_\S+)$/); return m ? { count: +m[1], name: m[2] } : null; })
  .filter(Boolean)
  .filter(a => !userDefined.has(a.name.toLowerCase()));

// Step 3: case-normalize
const norm = new Map();
for (const a of apis) {
  const k = a.name.toLowerCase();
  if (!norm.has(k)) norm.set(k, { canonical: a.name, totalCalls: a.count });
  else { const e = norm.get(k); e.totalCalls += a.count; if (/^sq_[A-Z]/.test(a.name)) e.canonical = a.name; }
}
const deduped = [...norm.values()].map(e => ({ count: e.totalCalls, name: e.canonical }));

// Step 4: noun-keyword classifier
function classify(rawName) {
  const s = rawName.toLowerCase().replace(/^sq_/, '');
  if (/appendage/.test(s)) return '14-Appendage';
  if (/^timer_/.test(s)) return '18-Timer';
  if (/shake|flashscreen|screenfx|xscrollstop|setcamera|setmyshake/.test(s)) return '16-CameraFX';
  if (/passiveobject/.test(s)) return '10-PassiveObj';
  if (/cnrd|pooledobject|drawonlyobject/.test(s)) return '11-Pool';
  if (/changestatus|activestatus|statelayer|customstate|isaddstatus|removeactivestatus/.test(s)) return '09-Status';
  if (/getcurrenttime|gettime$|^gettime\b|getframestarttime|getobjecttime|getdelaysum|setvalidtime|getstatetimer/.test(s)) return '20-Time';
  if (/animation|^ani_|currentani|currentframe|drawcurrentframe|loadskilleffectani|drawspecificframe|adddrawonlyani|drawonlyani|anirealimagesize|customani|drawcastgauge|deleteani$|anilayer|hideani|changedrawlayer|getcustomani/.test(s)) return '05-Animation';
  if (/skill|cast(time)?|requestbuy|iscancel|loadskill|getskillindex/.test(s)) return '06-Skill';
  if (/attackinfo|attackbonus|attackbounding|setattackpower|setactivedamageratio|attackpower|gethitbox|attackehitstun|attackedamageact|customattackinfo|getpowerwithpassive|getattackbonusrate|setattackpowerwithpassive/.test(s)) return '04-Attack/Hit';
  if (/[xyz]pos|axispos|velocity|accel|movetopos|stopmove|getdirection|getoppositedirection|getwidth|getheight|getobjectheight|ismovablepos|setcollision|setstaticspeedinfo|setstaticmoveinfo|movewithparent|^jump|moveparticle|setmovedirection|simplemoveton|setcurrentpos|setcurrentdirection|getdistance|getdistanceobject|getuniformvelocity|setzvelocity|getshootingverticalangle|getshootinghorizonangle|holdanddelaydie/.test(s)) return '07-Physics';
  if (/^gethp|^sethp|^getmp|^setmp|hpmaxup|getlife|takedamage|^cure|^heal|currenthp/.test(s)) return '08-Resource';
  if (/monster|enemyai|getenemy|isenemy|findshootingtarget|settargetobject|isinbattle|getobjectbyobjectid|aicharacter|targetobject|attractaimpoint/.test(s)) return '03-Monster/AI';
  if (/binary|^send|^recv|^writedword|^writefloat|^writeword|^writebyte|^writelong|^writebool|startwrite|startread|^addsetstatepacket|^addsetstate|addmessage|addpacket|getsendstate|sendpacket|ispvpmode/.test(s)) return '02-Net/RPC';
  if (/iskeydown|getkey|input|iscommandenable|getcommand|keyxenable|isentercommand|isclipcursor/.test(s)) return '01-Input';
  if (/^runscript|^rgb|^rgba|^alpha$|^playsound|^stopsound|^pausesound|^print|^trace|^log/.test(s)) return '12-ScriptRT';
  if (/^getrandom|^random|^abs$|^toradian|^todegree|^sin$|^cos$|^atan|^sqrt|^min$|^max$|^pow$|sintable|costable|setfrotateangle|setcustomrotate/.test(s)) return '17-Math';
  if (/effect(front)?|particle(object|creater)?|adddrawofzposy|adddrawony|deleteeffect|removemoveparticle|removeparticle|addobject$/.test(s)) return '15-VFX';
  if (/^getstate$|getstate[^a-z]|^setstate|^getsendstate|sentstate|getparentstate/.test(s)) return '19-StateMachine';
  if (/getobjectid|getuniqueid|getteam|ismycharacter|getobjectmanagerstage|^getobject$|getobjectbyid/.test(s)) return '22-Identity';
  if (/^var\b|^var$|intvect|intvector|getglobalintvector|getintdata|getlevelda|getvectordata|^getjob|getjob$|getgrowtype|getbonusratewithpassive|setglobal|getshuttle|^p$|^append$|getgroup|getcurrentmoduletype|getcustominfo|objecttosqrcharacter|isfixture|isvalidobject|isholdable|isgrabable|isending|isend|isvalid$|iscanattack/.test(s)) return '13-DataStore';
  if (/^is/.test(s)) return '21-Predicate';
  return '99-Unclassified';
}

const buckets = {};
for (const a of deduped) {
  const c = classify(a.name);
  if (!buckets[c]) buckets[c] = { unique: 0, calls: 0, names: [] };
  buckets[c].unique++;
  buckets[c].calls += a.count;
  buckets[c].names.push(a);
}

console.log('=== v4 classifier (final, on 443 case-normalized engine APIs) ===');
console.log('user-defined excluded:', userDefined.size, 'identifiers');
console.log('engine APIs (case-sensitive):', apis.length);
console.log('engine APIs (case-normalized):', deduped.length);
console.log('');

let totalU = 0, totalC = 0;
console.log('bucket'.padEnd(22) + 'unique'.padStart(8) + 'calls'.padStart(8));
for (const [c, b] of Object.entries(buckets).sort()) {
  b.names.sort((a, b) => b.count - a.count);
  console.log(c.padEnd(22) + String(b.unique).padStart(8) + String(b.calls).padStart(8));
  totalU += b.unique;
  totalC += b.calls;
}
console.log('-'.repeat(40));
console.log('total'.padEnd(22) + String(totalU).padStart(8) + String(totalC).padStart(8));
const u = buckets['99-Unclassified'] || { unique: 0, calls: 0 };
console.log('unclassified:', u.unique, '/', deduped.length, '=', (u.unique / deduped.length * 100).toFixed(1) + '%  call share:', (u.calls / totalC * 100).toFixed(1) + '%');

fs.writeFileSync(path.join(HERE, 'classify-v4-output.json'), JSON.stringify(buckets, null, 2));
