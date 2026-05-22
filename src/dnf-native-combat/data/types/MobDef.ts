import type { PvfDocument, PvfRef, PvfSection } from "./PvfDocument.js";
import type { ExtractedDocumentProvenance, PvfFact, PvfStringFact, PvfVectorFact } from "./Provenance.js";

export interface MobDef {
  kind: "mob";
  path: string;
  provenance: ExtractedDocumentProvenance;
  sections: PvfSection[];
  name: PvfStringFact | null;
  warlike: PvfFact<number> | null;
  sight: PvfFact<number> | null;
  weight: PvfFact<number> | null;
  hpMax: PvfVectorFact | null;
  attackInfo: PvfRef[];
  animationRefs: PvfRef[];
  category: string[];
  raw: PvfDocument;
}
