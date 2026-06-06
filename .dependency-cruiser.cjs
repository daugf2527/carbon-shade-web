/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "no-circular",
      severity: "warn",
      comment: "Circular dependencies break deterministic module init order (warn until pre-existing cycles resolved)",
      from: {},
      to: { circular: true },
    },
    {
      name: "engine-not-import-combat",
      severity: "error",
      comment: "src/engine/ is the new architecture replacing FROZEN src/combat/",
      from: { path: "^src/engine/" },
      to: { path: "^src/combat/" },
    },
    {
      name: "engine-not-import-game",
      severity: "error",
      comment: "Engine kernel must not depend on Phaser rendering layer",
      from: { path: "^src/engine/" },
      to: { path: "^src/game/" },
    },
    {
      name: "combat-not-import-game",
      severity: "error",
      comment: "Combat kernel must not depend on Phaser rendering layer",
      from: { path: "^src/combat/" },
      to: { path: "^src/game/" },
    },
    {
      name: "combat-to-engine-migration-debt",
      severity: "warn",
      comment: "combat→engine is the WRONG direction (engine replaces combat). Tracked migration debt: InputRecorder.ts type-only import. P4 should relocate it out of combat/.",
      from: { path: "^src/combat/" },
      to: { path: "^src/engine/" },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "node", "default"],
    },
  },
};
