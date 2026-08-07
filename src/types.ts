export enum RollingMode {
  DOUBLE = 'DOUBLE', // 翻倍滾倉
  CUSTOM_MULTIPLIER = 'CUSTOM_MULTIPLIER', // 自訂倍數滾倉
}

export enum CapitalReinvestMode {
  FIXED_MULTIPLIER = 'FIXED_MULTIPLIER', // 固定本金倍數 (不包含前段利潤)
  PROFIT_REINVEST = 'PROFIT_REINVEST', // 盈虧複利滾倉 (前段利潤自動滾入下一輪本金)
}

export enum TradeDirection {
  LONG = 'LONG', // 做多
  SHORT = 'SHORT', // 做空
}

export enum ContractType {
  USDT_MARGINED = 'USDT_MARGINED', // U本位
  COIN_MARGINED = 'COIN_MARGINED', // 幣本位
}

export interface CryptoPreset {
  symbol: string;
  name: string;
  defaultPrice: number;
  defaultDecimals: number; // For coin size (e.g. BTC = 0, ETH = 2, others can be custom)
  defaultPriceDecimals?: number; // For price representation (e.g. BTC = 1, ETH = 2)
}

export interface RollingLevel {
  id: string;
  level: number;
  entryPrice: number;      // 入場價格 (editable)
  isCustomEntryPrice: boolean;
  calcPrice: number;       // 計算價格 (editable)
  isCustomCalcPrice: boolean;
  leverage: number;        // 槓桿 (editable or reverse-calculated)
  isCustomLeverage: boolean;
  isDerivedLeverageFromPositionSize?: boolean; // 是否由加倉數量反推
  capital: number;         // 本金 (U) (calculated or custom-edited)
  isCustomCapital: boolean; // Whether the user manually overrode the capital for this round
  
  // Calculated fields:
  priceChangePercent: number; // 漲跌 % (compared to Level 1 entry price)
  averagePrice: number;       // 均價 (accumulated)
  liquidationPrice: number;   // 強平價格 (accumulated)
  distanceToLiqPercent: number; // 距離強平 %
  thisRoundPositionSize: number; // 本輪加倉 (in coins, editable)
  isCustomThisRoundPositionSize?: boolean; // 是否手動自訂本輪加倉量
  cumulativePositionSize: number; // 累計持倉數量 (in coins)
  accumulatedProfit: number;   // 累計盈虧 (USDT) at current calcPrice
  feesPaid: number;            // 累計手續費 (USDT)
  netProfit: number;           // 累計淨利潤 (USDT)
  isActive?: boolean;          // 是否為當前滾倉層級
  isCompleted?: boolean;       // 是否為已完成層級
  note?: string;               // 備註提醒
}

export interface StrategyParams {
  initialCapital: number;     // 初始本金 (USDT)
  initialPrice: number;       // 開場價格 (ENTRY)
  initialLeverage: number;    // 初始槓桿 (L)
  addPositionInterval: number; // 加倉幅度 (%)
  feeRate: number;            // 手續費 (%)
  finalExitPrice: number;     // 最終出場目標價
  direction: TradeDirection;  // 交易方向
  maintenanceMargin: number;  // 維持保證金比率 (%)
  contractType?: ContractType; // 合約本位 (U本位 / 幣本位)
  exchange?: string;          // 交易所名稱
  deductFeeFromNetProfit?: boolean;    // 淨利潤包含/扣除手續費 (預設 true)
  deductFeeFromPositionSizing?: boolean; // 加倉數量計算先扣除手續費 (預設 false)
}

export interface SavedStrategy {
  id: string;
  name: string;
  timestamp: number;
  rollingMode: RollingMode;
  reinvestMode: CapitalReinvestMode;
  customMultiplier: number;
  selectedPreset: string;
  customCurrencyName: string;
  qtyDecimals: number;
  priceDecimals: number;
  contractType?: ContractType;
  exchange?: string;
  deductFeeFromNetProfit?: boolean;
  deductFeeFromPositionSizing?: boolean;
  activeLevelIndex?: number | null;
  strategyParams: StrategyParams;
  levelsState: Array<{
    id: string;
    entryPrice?: number;
    isCustomEntryPrice?: boolean;
    leverage?: number;
    isCustomLeverage?: boolean;
    capital?: number;
    isCustomCapital?: boolean;
    calcPrice?: number;
    isCustomCalcPrice?: boolean;
    thisRoundPositionSize?: number;
    isCustomThisRoundPositionSize?: boolean;
    isActive?: boolean;
    note?: string;
  }>;
  orderIndex?: number;
}



