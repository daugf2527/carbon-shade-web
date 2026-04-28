import type { DebugSnapshot } from "../combat/debug/DebugOverlay.js";
export class RenderAdapter {
  constructor(private canvas: HTMLCanvasElement, private ctx = canvas.getContext("2d")!) {}
  render(snapshot: DebugSnapshot): void {
    const c=this.ctx; const w=this.canvas.width; const h=this.canvas.height; c.clearRect(0,0,w,h); c.fillStyle="#f8fafc"; c.fillRect(0,0,w,h); c.fillStyle="#111827"; c.font="18px monospace"; c.fillText("Combat Lab 0.2-R3 Real Implementation Pass", 24, 30); c.font="12px monospace"; c.fillText(`tick=${snapshot.tick} events=${snapshot.eventCount}`, 24, 52);
    c.strokeStyle="#cbd5e1"; c.beginPath(); c.moveTo(20,250); c.lineTo(w-20,250); c.stroke();
    for(const a of snapshot.actors as Array<{id:string; hp:number; pos:{x:number;y:number;z:number}; reaction:string; action:string|null; dead:boolean}>) { const x=40+a.pos.x*1.5; const y=250+a.pos.z-a.pos.y; c.fillStyle = a.id==="player"?"#2563eb":a.id==="boss"?"#7c3aed":a.id==="building"?"#475569":"#dc2626"; if(a.dead) c.fillStyle="#111827"; c.fillRect(x-16,y-48,32,48); c.strokeStyle="#0f172a"; c.strokeRect(x-16,y-48,32,48); c.fillStyle="#111827"; c.fillText(`${a.id} HP:${a.hp}`, x-34, y+18); c.fillText(`${a.reaction}${a.action?`/${a.action}`:""}`, x-44, y+34); }
    c.fillStyle="#111827"; c.font="12px monospace"; c.fillText("LastHitTrace", 24, 330); let row=350; for(const [k,v] of Object.entries(snapshot.lastHit)) { c.fillText(`${k}: ${JSON.stringify(v)}`,24,row); row+=16; }
    if(snapshot.scenario){ row=350; c.fillText("Scenario booleans", 520, 330); for(const [k,v] of Object.entries(snapshot.scenario)){ c.fillStyle=v?"#166534":"#991b1b"; c.fillText(`${v?"PASS":"FAIL"} ${k}`,520,row); row+=18; } }
  }
}
