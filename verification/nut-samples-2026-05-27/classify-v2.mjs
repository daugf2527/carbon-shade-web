#!/usr/bin/env node
// A-task: case-normalize + expanded classifier (2026-05-27)
// Goal: reduce unclassified from 47% to <10%, every new rule audit-tested

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

const raw = fs.readFileSync(path.join(HERE, 'sq-api-frequency.txt'), 'utf8').trim().split('\n');
const apis = raw.map(l => { const m = l.trim().match(/^(\d+)\s+(sq_\S+)$/); return m ? { count: +m[1], name: m[2] } : null; }).filter(Boolean);

// === Case-normalize first (merge 35 dedup pairs into single entries) ===
const norm = new Map(); // lowerName -> {canonicalName, totalCalls}
for (const a of apis) {
  const key = a.name.toLowerCase();
  if (!norm.has(key)) {
    norm.set(key, { canonical: a.name, totalCalls: a.count, variants: [a.name] });
  } else {
    const existing = norm.get(key);
    existing.totalCalls += a.count;
    existing.variants.push(a.name);
    // Prefer PascalCase canonical (more common)
    if (/^sq_[A-Z]/.test(a.name) && !/^sq_[A-Z]/.test(existing.canonical)) {
      existing.canonical = a.name;
    }
  }
}
const dedupedApis = [...norm.values()].map(e => ({ count: e.totalCalls, name: e.canonical, variants: e.variants }));
console.log('dedup: ' + apis.length + ' case-sensitive -> ' + dedupedApis.length + ' case-normalized');

// === Classifier v2: case-insensitive regex, expanded buckets ===
// Each bucket comes from observed top-API analysis + dnf docs knowledge.
// PRINCIPLE: a regex is added ONLY after manually checking that the matches
// it claims are semantically coherent. Comments document why each pattern
// was chosen.
function classify(rawName) {
  const n = rawName.toLowerCase();
  // 01-Input: keyboard + command queue (small but distinct system)
  if (/^sq_(iskeydown|getkey|input|iscommandenable|getcommand)/.test(n)) return '01-Input';
  // 02-Net/RPC: state packet broadcast, binary serialization, send/recv
  if (/^sq_(binary|send|recv|packet|writedword|writefloat|writeword|writebyte|writelong|startwrite|startread|addsetstatepacket|addsetstate)/.test(n)) return '02-Net/RPC';
  if (/^sq_(addstate(layer)?(animation)?)/.test(n)) return '09-Status';  // state layer = status overlay
  // 04-Attack/Hit: damage source query + bonus + hit response
  if (/^sq_(getcurrentattackinfo|setcurrentattackinfo|setcurrentattackbonusrate|getattackinfo|setattackpower|sethit|attackbonus|gethitbox|setactivedamageratio)/.test(n)) return '04-Attack/Hit';
  // 05-Animation: per-frame data, current animation control, draw frame
  if (/^sq_((set|get|add|remove|change)?(current)?animation|drawcurrentframe|loadskilleffectani|createanimation|createcnrdanimation|adddrawonlyanifromparent|drawspecificframe|ani_)/.test(n)) return '05-Animation';
  // 06-Skill: skill cooldown / level / availability / cancel
  if (/^sq_(isuseskill|getskilllevel|getskillcooltime|isskillenable|applyskill|cancelskill|iscancel|requestbuyskill|getskillc|loadskill)/.test(n)) return '06-Skill';
  // 07-Physics/Position: position + movement + collision
  if (/^sq_((set|get)?(current)?(x|y|z)?(pos|axispos)|getdistance|movetopos|stopmove|getdirection|getwidth|ismovablepos|setcollision|setstaticspeedinfo|movewithparent|jump)/.test(n)) return '07-Physics';
  // 08-Resource: HP / MP / damage application
  if (/^sq_(gethp|sethp|gethpmaxup|getmp|setmp|cure|takedamage|heal|getlifeleft)/.test(n)) return '08-Resource';
  // 09-Status (ChangeStatus): status effect system - distinct from Net "state packet"
  if (/^sq_(createchangestatus|isvalidactivestatus|getchangestatus|appendactivestatus|removechangestatus|appendbuffpassiveskill|setactivestatus|isaddcustomstate|removeactivestatus|sq_isaddingstatus)/.test(n)) return '09-Status';
  // 10-PassiveObject: object spawn / destroy via packet
  if (/^sq_(sendcreatepassiveobject|senddestroypacketpassiveobject|createpassiveobject|destroypassiveobject)/.test(n)) return '10-PassiveObj';
  // 11-Pool/CNRD: object pooling (CNRD = pooled lifecycle)
  if (/^sq_(createpooledobject|createcnrdpooledobject|createdrawonlyobject)/.test(n)) return '11-Pool';
  // 12-Script Runtime: meta APIs (script eval, color helpers, sound)
  if (/^sq_(runscript|addfunctionname|rgb|rgba|alpha|playsound|print|trace|log|stopsound|pausesound)/.test(n)) return '12-ScriptRT';
  // 13-Data Store: globals + vectors + level data (kept tight to var/vec/data)
  if (/^sq_(var$|var\(|intvect|intvector|getglobalintvector|getintdata|getlevelda|getvectordata|getjob|getgrowtype|getbonusratewithpassive|setglobal)/.test(n)) return '13-DataStore';
  // 14-Appendage: buff/aura/companion-bound auxiliary system
  if (/^sq_(appendappendage|removeappendage|isappendappendage|getappendage)/.test(n)) return '14-Appendage';
  // 15-VFX: visual effect spawns, draw-only objects, particle creators
  if (/^sq_(addeffect|addobject(particlecreater|attacker)?|createparticle|addparticleobject|addeffectfront|adddrawony|adddrawoffsetzposy)/.test(n)) return '15-VFX';
  // 16-CameraFX: screen-level effects
  if (/^sq_(flashscreen|addflashscreen|setshake|setcamera|screenfx)/.test(n)) return '16-CameraFX';
  // 17-Math/RNG: math helpers + random
  if (/^sq_(getrandom|abs$|toradian|todegree|sin$|cos$|atan|sqrt|min$|max$|pow)/.test(n)) return '17-Math';
  // 18-Timer: timer_* prefix specifically observed
  if (/^sq_timer_/.test(n)) return '18-Timer';
  // 19-Misc Predicate: Is* predicates that aren't already routed
  // (deliberately last — catches what didn't match above)
  if (/^sq_(ismyControlObject|isholdable|isgrabable|isend|isvalidobject|isending)/i.test(rawName)) return '19-MiscPredicate';
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

// === Result table ===
console.log('');
console.log('=== Classifier v2 result ===');
console.log('bucket'.padEnd(22) + 'unique'.padStart(8) + 'calls'.padStart(8) + '  top 3 examples (by freq)');
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

const unclassified = buckets['99-Unclassified'] || { unique: 0, calls: 0, names: [] };
const pct = (unclassified.unique / dedupedApis.length * 100).toFixed(1);
console.log('unclassified: ' + unclassified.unique + ' / ' + dedupedApis.length + ' = ' + pct + '%  (call share: ' + (unclassified.calls / total.calls * 100).toFixed(1) + '%)');

// === Audit: dump unclassified residual (top 60) ===
if (unclassified.unique > 0) {
  console.log('');
  console.log('=== Top 60 unclassified residual (manually inspect for new bucket candidates) ===');
  unclassified.names.sort((a, b) => b.count - a.count);
  for (const n of unclassified.names.slice(0, 60)) console.log('  ' + String(n.count).padStart(5) + '  ' + n.name);
}
