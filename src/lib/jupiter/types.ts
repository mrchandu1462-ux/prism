/**
 * JUPITER PROTOCOL INTEGRATION TYPES
 */

export interface JupiterRoutePlanStep {
  swapInfo: {
    ammKey: string;
    label: string; // e.g. "Raydium", "Orca"
    inputMint: string;
    outputMint: string;
    inAmount: string;
    outAmount: string;
    feeAmount: string;
    feeMint: string;
  };
  percent: number;
}

export interface JupiterQuoteResponse {
  inputMint: string;
  inAmount: string;
  outputMint: string;
  outAmount: string;
  otherAmountThreshold: string;
  swapMode: string;
  slippageBps: number;
  platformFee: any;
  priceImpactPct: string;
  routePlan: JupiterRoutePlanStep[];
  contextSlot?: number;
  timeTaken?: number;
}

export interface JupiterSwapRequestBody {
  userPublicKey: string;
  quoteResponse: JupiterQuoteResponse;
  wrapAndUnwrapSol?: boolean;
  useSharedAccounts?: boolean;
  feeAccount?: string;
  prioritizationFeeLamports?: string | number | 'auto';
  asLegacyTransaction?: boolean;
  dynamicComputeUnitLimit?: boolean;
}

export interface JupiterSwapResponse {
  swapTransaction: string; // Base64 encoded VersionedTransaction
  lastValidBlockHeight: number;
  prioritizationFeeLamports?: number;
}

export interface FormattedQuoteSummary {
  inputSymbol: string;
  inputAmountTokens: number;
  inputAmountLamports: string;
  outputSymbol: string;
  expectedOutputTokens: number;
  minimumOutputTokens: number;
  priceImpactPct: number;
  routeLabels: string[];
  slippageBps: number;
  rawQuote: JupiterQuoteResponse;
}

export type SwapExecutionStatus =
  | 'IDLE'
  | 'FETCHING_QUOTE'
  | 'QUOTE_READY'
  | 'BUILDING_TRANSACTION'
  | 'AWAITING_WALLET_SIGNATURE'
  | 'CONFIRMING_ON_CHAIN'
  | 'CONFIRMED'
  | 'ERROR';

export interface SwapExecutionState {
  status: SwapExecutionStatus;
  quoteSummary: FormattedQuoteSummary | null;
  transactionSignature: string | null;
  errorMessage: string | null;
}
