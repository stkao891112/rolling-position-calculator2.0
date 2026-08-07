import { CryptoPreset } from './types';

export const PRESET_CRYPTOS: CryptoPreset[] = [
  { symbol: 'BTC', name: 'Bitcoin', defaultPrice: 65000, defaultDecimals: 2, defaultPriceDecimals: 0 },
  { symbol: 'ETH', name: 'Ethereum', defaultPrice: 3400, defaultDecimals: 2, defaultPriceDecimals: 2 },
  { symbol: 'SOL', name: 'Solana', defaultPrice: 140, defaultDecimals: 2, defaultPriceDecimals: 2 },
  { symbol: 'XRP', name: 'Ripple', defaultPrice: 0.60, defaultDecimals: 2, defaultPriceDecimals: 2 },
  { symbol: 'DOGE', name: 'Dogecoin', defaultPrice: 0.12, defaultDecimals: 2, defaultPriceDecimals: 2 },
  { symbol: 'ADA', name: 'Cardano', defaultPrice: 0.45, defaultDecimals: 2, defaultPriceDecimals: 2 },
  { symbol: 'BNB', name: 'BNB', defaultPrice: 580, defaultDecimals: 2, defaultPriceDecimals: 2 },
];
