export class BMError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "BMError";
    this.code = code;
  }
}

export const FormulaErrorCodes = {
  auth: "#BM_AUTH!",
  notFound: "#BM_NOTFOUND!",
  rate: "#BM_RATE!",
  validation: "#BM_VALIDATION!",
  network: "#BM_NETWORK!",
  unknown: "#BM_ERROR!",
  env: "#BM_ENV!",
} as const;

export function normalizeFormulaError(err: unknown): string {
  if (err instanceof BMError) {
    return err.code;
  }

  if (err instanceof Error) {
    const message = err.message.toLowerCase();
    if (message.includes("401") || message.includes("403") || message.includes("auth")) {
      return FormulaErrorCodes.auth;
    }
    if (message.includes("404") || message.includes("not found")) {
      return FormulaErrorCodes.notFound;
    }
    if (message.includes("429") || message.includes("rate")) {
      return FormulaErrorCodes.rate;
    }
    if (message.includes("400") || message.includes("validation")) {
      return FormulaErrorCodes.validation;
    }
    if (message.includes("network") || message.includes("failed to fetch")) {
      return FormulaErrorCodes.network;
    }
  }

  return FormulaErrorCodes.unknown;
}
