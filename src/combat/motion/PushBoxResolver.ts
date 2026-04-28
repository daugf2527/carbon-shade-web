import type { Actor } from "../types.js";

function isPlayer(a: Actor): boolean { return a.flags.playerControlled === true || a.id === "player"; }
function isSoftEnemy(a: Actor): boolean { return a.faction === "enemy" && a.type !== "building" && a.type !== "boss"; }
function isHardBlocker(a: Actor): boolean { return a.type === "building" || a.type === "boss" || a.pushBox.immovable === true; }
function isAttackAction(a: Actor): boolean {
  const name = a.currentAction?.actionName ?? "";
  return name.startsWith("Normal") || name.startsWith("Frenzy") || name === "DashAttack" || name === "JumpAttack" || name === "UpwardSlash" || name === "MountainousWheel" || name === "RagingFury" || name === "Bloodlust";
}

/**
 * DNF-like push boxes.
 *
 * Body collision is not hit detection. Small monsters are soft occupancy and
 * should not eat player locomotion. Boss/building bodies remain hard blockers,
 * but lane slide is preferred over shove-back.
 */
export class PushBoxResolver {
  resolve(actors: Actor[]): void {
    const live = actors.filter(a=>!a.flags.dead);
    for (let i=0;i<live.length;i++) for (let j=i+1;j<live.length;j++) {
      const a=live[i]; const b=live[j]; if(!a||!b) continue;
      const dx=b.position.x-a.position.x;
      const dz=b.position.z-a.position.z;
      const overlapX=(a.pushBox.w+b.pushBox.w)/2-Math.abs(dx);
      const overlapZ=(a.pushBox.d+b.pushBox.d)/2-Math.abs(dz);
      if(overlapX<=0 || overlapZ<=0) continue;

      const aPlayer = isPlayer(a); const bPlayer = isPlayer(b);
      const player = aPlayer ? a : bPlayer ? b : null;
      const other = aPlayer ? b : bPlayer ? a : null;

      if (player && other) {
        if (isSoftEnemy(other)) {
          this.resolvePlayerSoftEnemy(player, other, overlapX, overlapZ);
          continue;
        }
        if (isHardBlocker(other)) {
          this.resolvePlayerHardBlocker(player, other, overlapX, overlapZ);
          continue;
        }
      }

      this.resolveGeneric(a,b,dx,dz,overlapX,overlapZ);
    }
  }

  private resolvePlayerSoftEnemy(player: Actor, enemy: Actor, overlapX: number, overlapZ: number): void {
    const laneDir = enemy.position.z >= player.position.z ? 1 : -1;
    const awayX = enemy.position.x >= player.position.x ? 1 : -1;

    // Player retains command priority. The monster yields lane first, then X.
    const laneYield = Math.min(overlapZ + 1.0, player.locomotion.mode === "run" ? 3.4 : 2.8);
    enemy.position.z += laneDir * laneYield;

    const playerIsAttacking = isAttackAction(player);
    const desiredGapCorrection = Math.max(0, overlapX - 1.2);
    const xYield = playerIsAttacking
      ? Math.min(desiredGapCorrection + 1.8, 4.8)
      : Math.min(desiredGapCorrection * 0.85 + 0.9, 3.2);
    enemy.position.x += awayX * xYield;

    // No player X shove against ordinary mobs. The monster yields enough to
    // prevent body overlap while keeping player locomotion responsive.
  }

  private resolvePlayerHardBlocker(player: Actor, blocker: Actor, overlapX: number, overlapZ: number): void {
    const laneDir = player.position.z >= blocker.position.z ? 1 : -1;
    const sideDir = player.position.x >= blocker.position.x ? 1 : -1;

    if (overlapZ > 0.4) {
      player.position.z += laneDir * Math.min(overlapZ + 0.45, 2.4);
      return;
    }

    // Last-resort X correction only for severe center overlap.
    player.position.x += sideDir * Math.min(overlapX, 0.65);
  }

  private resolveGeneric(a: Actor, b: Actor, dx: number, dz: number, overlapX: number, overlapZ: number): void {
    const dir=dx>=0?1:-1;
    const laneDir=dz>=0?1:-1;
    if(!a.pushBox.immovable && b.pushBox.immovable) {
      a.position.z -= Math.min(overlapZ, 1.5) * laneDir;
    } else if(a.pushBox.immovable && !b.pushBox.immovable) {
      b.position.z += Math.min(overlapZ, 1.5) * laneDir;
    } else if(!a.pushBox.immovable && !b.pushBox.immovable){
      if (overlapZ <= overlapX) {
        const move=Math.min(overlapZ,1.2);
        a.position.z-=move*0.5*laneDir; b.position.z+=move*0.5*laneDir;
      } else {
        const move=Math.min(overlapX,1.2);
        a.position.x-=move*0.5*dir; b.position.x+=move*0.5*dir;
      }
    }
  }
}
