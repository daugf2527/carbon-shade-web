import type { Actor, HitBoxFrameWindow, HitQuery } from "../types.js";
import { actorHurtRect, rectsOverlap2D5, signedFacingScale } from "../util/geometry.js";
import { nextId } from "../util/ids.js";

export class HitResolver2D5 {
  buildQuery(tick: number, attacker: Actor, hitbox: HitBoxFrameWindow): HitQuery {
    const facing = attacker.currentAction?.lockedFacing ?? attacker.facing;
    const scale = signedFacingScale(facing);
    return {
      id: nextId("query"),
      tick,
      attackerId:attacker.id,
      actionInstanceId:attacker.currentAction?.id ?? "none",
      actionName:attacker.currentAction?.actionName ?? "Idle",
      hitboxId:hitbox.id,
      hitGroupId:hitbox.hitGroupId,
      box:{ x:attacker.position.x + hitbox.offsetX*scale, z:attacker.position.z+hitbox.offsetZ, y:attacker.position.y+hitbox.offsetY, w:hitbox.w, d:hitbox.d, h:hitbox.h },
      facing,
      hitType:hitbox.hitType,
      damageType:hitbox.damageType,
      attackLevel:hitbox.attackLevel,
      controlPower:hitbox.controlPower,
      canHitDowned:hitbox.canHitDowned,
      canLaunch:hitbox.canLaunch,
      canKnockdown:hitbox.canKnockdown,
      canGrab:hitbox.canGrab,
      maxTargets:hitbox.maxTargets,
      reactionProfile:hitbox.reactionProfile,
      impactSnapX: hitbox.impactSnapX,
      visualRecoilFrames: hitbox.visualRecoilFrames,
    };
  }

  geometry(query: HitQuery, target: Actor): {overlap:boolean; zMismatch:boolean; yMismatch:boolean} {
    const hurt = target.hurtBoxes[0];
    if (!hurt) return {overlap:false,zMismatch:false,yMismatch:true};
    return rectsOverlap2D5(query.box, actorHurtRect(target.position, hurt));
  }
}
