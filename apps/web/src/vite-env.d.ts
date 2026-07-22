/// <reference types="vite/client" />

type EverifySdkResult = {
  status?: string;
  result?: { session_id?: string };
};

interface Window {
  onEgovSsoSuccess?: (exchangeCode: string) => void | Promise<void>;
  eKYC?: () => {
    start(input: { pubKey: string }): Promise<EverifySdkResult>;
  };
}
