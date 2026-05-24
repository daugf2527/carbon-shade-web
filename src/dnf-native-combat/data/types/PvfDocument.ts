export type PvfScalarAttribute =
  | { t: "int"; v: number }
  | { t: "float"; v: number }
  | { t: "str"; v: string }
  | { t: "link"; v: string };

export interface PvfRefAttribute {
  t: "ref";
  target_kind: string;
  target_path: string;
  raw: string;
}

export interface PvfRef {
  targetKind: string;
  targetPath: string;
  raw: string;
}

export interface PvfEnumAttribute {
  t: "enum";
  v: number;
  name: string;
  enum: string;
}

export interface PvfVectorAttribute {
  t: "vec";
  length: number;
  item_type?: string;
  /**
   * Audit B3 (contract-symmetry, 2026-05-24): C++ printLeafValue now ALWAYS
   * emits typed `{t,v}` for vec/mat leaves (previously dual-shape: bare
   * primitive when homogeneous, typed when mixed). Old PVF dumps that still
   * carry bare `number[]` remain valid — both shapes parse cleanly via the
   * `extractLeafNumber()` helper in parserUtils.ts. Schemas in validator.ts
   * accept the union via a custom transform.
   */
  items: Array<number | { t: string; v: number }>;
}

export interface PvfMatrixAttribute {
  t: "mat";
  rows: number;
  cols: number;
  item_type?: string;
  items: unknown[][];
}

export type PvfAttribute =
  | PvfScalarAttribute
  | PvfRefAttribute
  | PvfEnumAttribute
  | PvfVectorAttribute
  | PvfMatrixAttribute
  | ({ t: string } & Record<string, unknown>);

export interface PvfSection {
  name: string;
  attributes: PvfAttribute[];
}

export interface PvfDocument {
  extractor_version: string;
  extract_timestamp: string;
  /**
   * Hash of the source PVF (CRC32 via D3 provenance). Optional because
   * pre-D3 fixtures, synthetic test inputs, and any document whose extractor
   * did not emit the field may omit it. Parsers must tolerate undefined.
   */
  source_pvf_hash?: string;
  path: string;
  type: "document" | string;
  sections: PvfSection[];
}
