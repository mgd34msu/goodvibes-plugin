/**
 * Minimal ambient typings for pdf-parse@1.x (no upstream @types package).
 * The module is CJS (module.exports = function); with esModuleInterop the
 * function surfaces as the default export of a dynamic import namespace.
 */
declare module "pdf-parse" {
  interface PdfParseResult {
    numpages: number;
    numrender: number;
    info?: Record<string, unknown>;
    metadata?: unknown;
    version?: string;
    text: string;
  }

  function pdfParse(
    dataBuffer: Buffer | Uint8Array,
    options?: Record<string, unknown>
  ): Promise<PdfParseResult>;

  export default pdfParse;
}
