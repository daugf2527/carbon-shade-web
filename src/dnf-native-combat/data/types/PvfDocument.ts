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
  items: number[];
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
  source_pvf_hash: string;
  path: string;
  type: "document" | string;
  sections: PvfSection[];
}
