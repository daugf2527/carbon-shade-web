// SklToActionMapper — Maps parsed .skl + .ani data to FrameDataAction format.
// Bridges extraction module output (SklSkillDef, AniDef) to combat engine input.
//
// Phase 4 of 6-phase frame-level restoration plan.
// Works with best-effort data: handles both inline test fixtures (deterministic)
// and real Script.pvf data (graceful degradation when data is incomplete).

import type { SklSkillDef, AniDef, AniHitBox, MappedFrameDataAction } from "./types.js";

export class SklToActionMapper {
  /**
   * Map a single skill definition + animation data to a MappedFrameDataAction.
   *
   * @param skl — parsed skill definition from SklAnalyzer
   * @param ani — parsed animation definition from AniAnalyzer (can be undefined)
   * @returns intermediate mapped action ready for Phase 5 validation
   */
  static map(skl: SklSkillDef, ani?: AniDef): MappedFrameDataAction {
    const warnings: string[] = [];

    // 1. Derive action name
    const actionName = SklToActionMapper.deriveActionName(skl);

    // 2. Determine total frames
    const totalFrames = ani
      ? SklToActionMapper.estimateTotalFrames(ani)
      : 30; // default for skills without .ani data

    // 3. Build startup window
    const startupFrames = Math.max(3, Math.floor(totalFrames * 0.2));
    const startup = [{ start: 0, end: startupFrames }];

    // 4. Map hitboxes
    const active = ani
      ? ani.hitBoxes.map((hb, i) => SklToActionMapper.convertHitbox(hb, i, warnings))
      : [];

    if (!ani) {
      warnings.push("No .ani data available — hitboxes are empty");
    } else if (ani.hitBoxes.length === 0 && ani.totalFrames > 0) {
      warnings.push("Animation has frames but no hitboxes detected");
    }

    // 5. Collect source paths
    const sourceAniPaths = ani?.sourcePath ? [ani.sourcePath] : [];

    return {
      actionName,
      totalFrames,
      startup,
      active,
      cooldownMs: skl.coolTimeMs,
      castTimeMs: skl.castTimeMs,
      mpCost: skl.consumeMp,
      cubeCost: skl.cubeCost,
      skillId: skl.skillId,
      name: skl.name,
      sourceSklPath: skl.sourcePath,
      sourceAniPaths,
      warnings,
    };
  }

  /**
   * Batch map multiple skills with an optional animation lookup map.
   *
   * @param skills — array of parsed skill definitions
   * @param aniMap — map from .ani path to parsed AniDef (optional)
   * @returns array of MappedFrameDataAction
   */
  static mapBatch(
    skills: SklSkillDef[],
    aniMap?: Map<string, AniDef>,
  ): MappedFrameDataAction[] {
    return skills.map((skl) => {
      // Try to find matching .ani by checking each aniFileRef
      let ani: AniDef | undefined;
      if (aniMap && skl.aniFileRefs.length > 0) {
        for (const ref of skl.aniFileRefs) {
          const candidate = aniMap.get(ref);
          if (candidate) {
            ani = candidate;
            break;
          }
        }
      }

      return SklToActionMapper.map(skl, ani);
    });
  }

  /**
   * Convert a DNF .ani hitbox (corner-based coords) to the combat engine's
   * centered box representation.
   *
   * DNF format: (x1,y1,z1) → (x2,y2,z2)  — two corners of a box
   * Combat format: { x, y, z, w, h, d } — center + dimensions
   */
  static convertHitboxCoords(hitbox: AniHitBox): {
    x: number;
    y: number;
    z: number;
    w: number;
    h: number;
    d: number;
  } {
    return {
      x: (hitbox.x1 + hitbox.x2) / 2,
      y: (hitbox.y1 + hitbox.y2) / 2,
      z: (hitbox.z1 + hitbox.z2) / 2,
      w: Math.abs(hitbox.x2 - hitbox.x1),
      h: Math.abs(hitbox.y2 - hitbox.y1),
      d: Math.abs(hitbox.z2 - hitbox.z1),
    };
  }

  /**
   * Derive a human-readable action name from skill data.
   * Falls back to skillId if name is unavailable.
   */
  static deriveActionName(skl: SklSkillDef): string {
    if (skl.name && skl.name.length > 0) {
      // Clean up the name: remove path-like segments, keep readable part
      const cleanName = skl.name
        .replace(/^.*[\\/]/, "")  // remove path prefix
        .replace(/\.skl$/, "")    // remove extension
        .replace(/_/g, " ");      // underscores to spaces
      if (cleanName.length > 0) return cleanName;
    }
    // Fallback: use skill ID
    return `Skill_${skl.skillId}`;
  }

  /**
   * Estimate total frames from animation data.
   * Uses AniDef.totalFrames if available; otherwise estimates from raw section size.
   */
  static estimateTotalFrames(ani: AniDef): number {
    if (ani.totalFrames > 0) {
      return ani.totalFrames;
    }

    // Fallback: estimate from raw frame data size
    // Typical .ani frame records are 32-40 bytes each
    if (ani.rawSections.length > 0) {
      const frameDataSize = ani.rawSections[0]!.size;
      if (frameDataSize > 0) {
        const estimated = Math.max(1, Math.floor(frameDataSize / 36));
        return Math.max(10, estimated); // floor at 10 frames
      }
    }

    // Absolute fallback
    return 30;
  }

  /**
   * Convert a single AniHitBox to the active hitbox format.
   */
  private static convertHitbox(
    hb: AniHitBox,
    index: number,
    warnings: string[],
  ): MappedFrameDataAction["active"][number] {
    const coords = SklToActionMapper.convertHitboxCoords(hb);

    // Validate shape compatibility
    let shape = hb.shape;
    if (shape !== "rect" && shape !== "circle") {
      warnings.push(
        `Hitbox ${index}: unsupported shape "${shape}", defaulting to "rect"`,
      );
      shape = "rect";
    }

    return {
      start: hb.frameStart,
      end: hb.frameEnd,
      id: `hit_${index}`,
      hitGroupId: `group_${hb.attackCategory ?? "default"}`,
      shape,
      offsetX: coords.x,
      offsetZ: coords.z,
      offsetY: coords.y,
      w: coords.w,
      d: coords.d,
      h: coords.h,
      baseDamage: hb.damageRate ?? 100,
    };
  }
}
