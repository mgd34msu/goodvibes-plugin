declare const VALID_JSON_ESCAPES: Set<string>;
declare function fixJsonEscaping(jsonString: string): {
    fixed: string;
    wasFixed: boolean;
};
declare function extractAndFixJson(command: string): string | null;
declare const chunks: Buffer[];
