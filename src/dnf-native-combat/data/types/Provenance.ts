export interface ExtractedDocumentProvenance {
  extractorVersion: string;
  extractTimestamp: string;
  sourcePvfHash: string;
  sourceRef: string;
}

export interface ParsedFieldProvenance extends ExtractedDocumentProvenance {
  sectionName: string;
}

export interface PvfFact<T> {
  value: T;
  unit: string;
  provenance: ParsedFieldProvenance;
}

export interface PvfStringFact extends PvfFact<string> {
  rawValue?: string;
}

export interface PvfVectorFact {
  values: number[];
  unit: string;
  provenance: ParsedFieldProvenance;
}
