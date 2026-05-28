#!/usr/bin/env node
// A-task v3: noun-keyword based classifier (2026-05-27)
//
// LESSON from v2 failure (67% unclassified):
// sq_* names follow verb+noun pattern. Verb prefix (Get/Set/Add/Is/Create) is
// uninformative — every system has Get/Set. The SYSTEM is determined by the
// NOUN keyword that follows the verb. This v3 classifier uses noun matching.
//
// SKEPTICISM REQUIREMENT:
// After running, manually audit 5 random entries per bucket. If any bucket
// contains semantically wrong entries, refine the regex.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

const raw = fs.readFileSync(path.join(HERE, 'sq-api-frequency.txt'), 'utf8').trim().split('\n');
const apis = raw.map(l => { const m = l.trim().match(/^(\d+)\s+(sq_\S+)$/); return m ? { count: +m[1], name: m[2] } : null; }).filter(Boolean);

const norm = new Map();
for (const a of apis) {
  const key = a.name.toLowerCase();
  if (!norm.has(key)) norm.set(key, { canonical: a.name, totalCalls: a.count });
  else { const e = norm.get(key); e.totalCalls += a.count; if (/^sq_[A-Z]/.test(a.name)) e.canonical = a.name; }
}
const dedupedApis = [...norm.values()].map(e => ({ count: e.totalCalls, name: e.canonical }));

// Match noun keywords in API name. Order matters: more specific first.
// Match against the LOWERCASE name to be case-insensitive.
function classify(rawName) {
  const n = rawName.toLowerCase();
  // High-precision noun patterns (each noun anchored to a system)
  // The system tag is the LAST noun in the list to match — using indexOf checks
  // multiple candidates so we can spot ambiguous ones.

  // Strip the sq_ prefix for cleaner matching
  const s = n.replace(/^sq_/, '');

  // === 19 system noun-keyword map ===
  // (later patterns can override earlier ones; we use ordered conditional chain
  //  so the most specific noun wins)

  // 14-Appendage: explicit
  if (/appendage/.test(s)) return '14-Appendage';
  // 18-Timer: prefix-locked
  if (/^timer_/.test(s)) return '18-Timer';
  // 16-CameraFX: shake / flashScreen / screen-specific FX
  if (/shake|flashscreen|screenfx|xscrollstop|setcamera/.test(s)) return '16-CameraFX';
  // 10-PassiveObject: passive object lifecycle (distinct from "pool")
  if (/passiveobject/.test(s)) return '10-PassiveObj';
  // 11-Pool/CNRD: object pooling (CNRD prefix is the marker)
  if (/cnrd|pooledobject|drawonlyobject/.test(s)) return '11-Pool';
  // 09-Status (ChangeStatus / state-layer)
  if (/changestatus|activestatus|statelayer|customstate|isaddstatus/.test(s)) return '09-Status';
  // 05-Animation: ani/animation/frame/sprite/draw-current-frame
  if (/animation|^ani_|currentani|currentframe|drawcurrentframe|loadskilleffectani|drawspecificframe|adddrawonlyani|drawonlyani|aniimagesize|customani|delaysum|framestarttime|drawcastgauge/.test(s)) return '05-Animation';
  // 06-Skill: skill cooldown / level / availability / cancel / cast
  if (/skill|cast(time)?|requestbuy|iscancel|loadskill/.test(s)) return '06-Skill';
  // 04-Attack/Hit: damage source + bonus + bounding box
  if (/attackinfo|attackbonus|attackbounding|setattackpower|setactivedamageratio|attackpower|gethitbox/.test(s)) return '04-Attack/Hit';
  // 07-Physics: pos/velocity/accel/move/direction/distance/jump/uniform
  if (/(^|[^a-z])pos([^a-z]|$)|axispos|velocity|accel|movetopos|stopmove|getdirection|getoppositedirection|getwidth|getheight|ismovablepos|setcollision|setstaticspeedinfo|setstaticmoveinfo|movewithparent|^jump|moveparticle|setmovedirection|simplemovetonearmovablepos|getuniformvelocity/.test(s)) return '07-Physics';
  // 08-Resource: HP / MP / cure / damage application
  if (/^gethp|^sethp|^getmp|^setmp|hpmaxup|getlife|takedamage|^cure|^heal|getcurrenthp/.test(s)) return '08-Resource';
  // 03-Monster/AI: rare in player .nut, but enumerate known
  if (/monster|enemyai|getenemy|isenemy/.test(s)) return '03-Monster';
  // 02-Net/RPC: binary serialization + state packet broadcast
  if (/binary|^send|^recv|^writedword|^writefloat|^writeword|^writebyte|^writelong|startwrite|startread|^addsetstatepacket|^addsetstate|addmessage|addpacket|getsendstate|sendpacket|ispvpmode/.test(s)) return '02-Net/RPC';
  // 01-Input: keyboard + command queue
  if (/iskeydown|getkey|input|iscommandenable|getcommand|keyxenable/.test(s)) return '01-Input';
  // 12-ScriptRT: meta/eval + color + sound (engine RT services)
  if (/^runscript|^addfunctionname|^rgb|^rgba|^alpha$|^playsound|^stopsound|^pausesound|^print|^trace|^log|^validtime/.test(s)) return '12-ScriptRT';
  // 17-Math/RNG
  if (/^getrandom|^random|^abs$|^toradian|^todegree|^sin$|^cos$|^atan|^sqrt|^min$|^max$|^pow$|setfrotateangle|setcustomrotate/.test(s)) return '17-Math';
  // 15-VFX (effect / particle / draw-only)
  if (/effect(front)?|particle(object|creater)?|adddrawofzposy|adddrawony|deleteeffect|removemoveparticle|removeparticle/.test(s)) return '15-VFX';
  // 13-DataStore (var / vector / globals / leveldata / growType / job)
  if (/^var\b|^var$|intvect|intvector|getglobalintvector|getintdata|getlevelda|getvectordata|^getjob|getjob$|getgrowtype|getbonusratewithpassive|setglobal|getshuttle|^p$|^append$|^getobject(|manager|time|height)$|^getuniqueid|^getgroup|^getcurrentmoduletype|^getcustominfo|^getcustomattackinfo|^getstatetimer|^objecttosqrcharacter|^isfixture|^isvalidobject|^isholdable|^isgrabable|^isending|^isend|^isvalid|^iscanattack/.test(s)) return '13-DataStore';
  // 19-State machine / state query (kept separate from Status which is overlay)
  if (/^getstate$|getstate[^a-z]|^setstate|^getsendstate|sentstate/.test(s)) return '19-StateMachine';
  // 20-Time/Frame query (Timer-adjacent but read-only)
  if (/^getcurrenttime|^gettime|^getframestarttime|getobjecttime|^getdelaysum/.test(s)) return '20-Time';
  // 21-Utility predicates (Is* that didn't match a system)
  if (/^ismycontrolobject|^ispvp|^isholdable|^isgrabable|^isend|^isvalid|^isfixture/.test(s)) return '21-Predicate';
  return '99-Unclassified';
}

const buckets = {};
for (const a of dedupedApis) {
  const c = classify(a.name);
  if (!buckets[c]) buckets[c] = { unique: 0, calls: 0, names: [] };
  buckets[c].unique++;
  buckets[c].calls += a.count;
  buckets[c].names.push({ name: a.name, count: a.count });
}

console.log('=== Classifier v3 (noun-keyword based) ===');
console.log('bucket'.padEnd(22) + 'unique'.padStart(8) + 'calls'.padStart(8) + '  top 3');
const total = { unique: 0, calls: 0 };
for (const [c, b] of Object.entries(buckets).sort()) {
  b.names.sort((a, b) => b.count - a.count);
  const ex = b.names.slice(0, 3).map(n => `${n.name}(${n.count})`).join(', ');
  console.log(c.padEnd(22) + String(b.unique).padStart(8) + String(b.calls).padStart(8) + '  ' + ex);
  total.unique += b.unique;
  total.calls += b.calls;
}
console.log('-'.repeat(60));
console.log('total'.padEnd(22) + String(total.unique).padStart(8) + String(total.calls).padStart(8));
const u = buckets['99-Unclassified'] || { unique: 0, calls: 0, names: [] };
console.log('unclassified: ' + u.unique + ' / ' + dedupedApis.length + ' = ' + (u.unique / dedupedApis.length * 100).toFixed(1) + '%  (call share: ' + (u.calls / total.calls * 100).toFixed(1) + '%)');

if (u.unique > 0) {
  console.log('');
  console.log('=== Top 40 unclassified residual ===');
  u.names.sort((a, b) => b.count - a.count);
  for (const n of u.names.slice(0, 40)) console.log('  ' + String(n.count).padStart(5) + '  ' + n.name);
}

// Write buckets for audit
fs.writeFileSync(path.join(HERE, 'classify-v3-output.json'), JSON.stringify(buckets, null, 2));
console.log('');
console.log('full buckets written to verification/nut-samples-2026-05-27/classify-v3-output.json');
