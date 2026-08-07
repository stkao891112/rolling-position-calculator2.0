import {
  RollingLevel,
  StrategyParams,
  RollingMode,
  CapitalReinvestMode,
  TradeDirection,
} from './types';

/**
 * Rounds a number to a specified number of decimal places
 */
export function roundTo(val: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(val * factor) / factor;
}

/**
 * Main engine to recalculate all rolling levels based on user configurations.
 */
export function recalculateLevels(
  currentLevels: { 
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
  }[],
  params: StrategyParams,
  mode: RollingMode,
  reinvestMode: CapitalReinvestMode,
  customMultiplier: number,
  qtyDecimals: number,
  priceDecimals: number
): RollingLevel[] {
  const result: RollingLevel[] = [];
  const directionMultiplier = params.direction === TradeDirection.LONG ? 1 : -1;

  let totalCapitalPaid = 0;
  let accumulatedFees = 0;
  let cumSize = 0;
  let cumulativeValue = 0;
  let actualEquity = 0;
  let prevLevelEquity = 0;

  for (let i = 0; i < currentLevels.length; i++) {
    const rawLevel = currentLevels[i];
    const levelNumber = i + 1;

    // 1. Determine Leverage initially
    let leverage = params.initialLeverage;
    if (rawLevel.isCustomLeverage && rawLevel.leverage !== undefined) {
      leverage = rawLevel.leverage;
    }

    // 2. Determine Entry Price
    let entryPrice = 0;
    if (rawLevel.isCustomEntryPrice && rawLevel.entryPrice !== undefined) {
      entryPrice = rawLevel.entryPrice;
    } else {
      if (i === 0) {
        entryPrice = params.initialPrice;
      } else {
        const prevLevel = result[i - 1];
        if (mode === RollingMode.DOUBLE) {
          // Double mode auto price calculation: Profit of previous level reaches 100% of its margin
          // change% = 1 / prev_leverage
          const changePercent = 1 / prevLevel.leverage;
          entryPrice = prevLevel.entryPrice * (1 + directionMultiplier * changePercent);
        } else {
          // Custom interval mode auto price calculation
          entryPrice = prevLevel.entryPrice * (1 + directionMultiplier * (params.addPositionInterval / 100));
        }
      }
    }
    // Round entry price immediately
    entryPrice = roundTo(entryPrice, priceDecimals);

    // 3. Determine Capital (本金)
    let capital = 0;
    let prevCumulativeProfit = 0;
    if (i === 0) {
      capital = params.initialCapital;
    } else {
      const prevLevel = result[i - 1];
      // Total cumulative profit up to this entry price (before adding level i)
      prevCumulativeProfit = directionMultiplier * (entryPrice - prevLevel.averagePrice) * prevLevel.cumulativePositionSize;

      if (rawLevel.isCustomCapital && rawLevel.capital !== undefined) {
        capital = rawLevel.capital;
      } else {
        // Auto calculate capital based on mode and reinvestment strategy
        if (reinvestMode === CapitalReinvestMode.PROFIT_REINVEST) {
          // If deductFeeFromPositionSizing is enabled, subtract accumulated fees so far from reinvestment capital
          const feeDeduction = params.deductFeeFromPositionSizing ? accumulatedFees : 0;
          capital = params.initialCapital + prevCumulativeProfit - feeDeduction;
        } else {
          // Fixed Multiplier Mode (does not reinvest previous profit, capital scales directly)
          if (mode === RollingMode.DOUBLE) {
            capital = params.initialCapital * Math.pow(2, i);
          } else {
            capital = params.initialCapital * Math.pow(customMultiplier, i);
          }
        }
      }
    }

    // Safeguard capital from being negative
    capital = Math.max(0, roundTo(capital, 2));

    // Update actual account equity
    if (i === 0) {
      actualEquity = capital;
      prevLevelEquity = actualEquity;
    } else {
      const prevLevel = result[i - 1];
      const additionalProfit = directionMultiplier * (entryPrice - prevLevel.entryPrice) * prevLevel.cumulativePositionSize;
      const equityBeforeAddition = prevLevelEquity + additionalProfit;

      let freshInjection = 0;
      if (reinvestMode === CapitalReinvestMode.PROFIT_REINVEST) {
        // If they manually override capital, treat the excess as fresh injection.
        const feeDeduction = params.deductFeeFromPositionSizing ? accumulatedFees : 0;
        const autoCapital = params.initialCapital + prevCumulativeProfit - feeDeduction;
        if (rawLevel.isCustomCapital && rawLevel.capital !== undefined) {
          freshInjection = Math.max(0, rawLevel.capital - autoCapital);
        } else {
          freshInjection = 0;
        }
      } else {
        freshInjection = capital;
      }

      actualEquity = equityBeforeAddition + freshInjection;
      prevLevelEquity = actualEquity;
    }

    // Update total cumulative capital paid into the positions
    totalCapitalPaid += capital;

    // 4. Calculate Position Size & Leverage for this round
    let isDerivedLeverageFromPositionSize = false;
    let targetCumulativeSize = 0;
    let thisRoundPositionSize = 0;

    if (rawLevel.isCustomThisRoundPositionSize && rawLevel.thisRoundPositionSize !== undefined) {
      // User customized position size -> Reverse-calculate leverage
      thisRoundPositionSize = rawLevel.thisRoundPositionSize;
      targetCumulativeSize = roundTo(cumSize + thisRoundPositionSize, qtyDecimals);
      if (capital > 0 && entryPrice > 0) {
        leverage = (targetCumulativeSize * entryPrice) / capital;
        isDerivedLeverageFromPositionSize = true;
      }
    } else {
      // Standard leverage -> calculate position size
      targetCumulativeSize = entryPrice > 0 ? (capital * leverage) / entryPrice : 0;
      targetCumulativeSize = roundTo(targetCumulativeSize, qtyDecimals);
      thisRoundPositionSize = roundTo(targetCumulativeSize - cumSize, qtyDecimals);
    }

    // Fee is charged on the absolute value of the traded size (交易額)
    const thisRoundFee = Math.abs(thisRoundPositionSize) * entryPrice * (params.feeRate / 100);

    // Update cumulative stats
    accumulatedFees += thisRoundFee;

    // 5. Calculate Average Entry Price (均價)
    let averagePrice = 0;
    if (cumSize > 0) {
      if (thisRoundPositionSize >= 0) {
        cumulativeValue += thisRoundPositionSize * entryPrice;
        averagePrice = targetCumulativeSize > 0 ? cumulativeValue / targetCumulativeSize : 0;
      } else {
        // Reducing position size (減倉) does not change the average price of the remaining position
        const prevAveragePrice = result[i - 1]?.averagePrice ?? 0;
        averagePrice = prevAveragePrice;
        cumulativeValue = targetCumulativeSize * averagePrice;
      }
    } else {
      cumulativeValue = targetCumulativeSize * entryPrice;
      averagePrice = entryPrice;
    }
    averagePrice = roundTo(averagePrice, priceDecimals);

    // Update cumulative size to the new target
    cumSize = targetCumulativeSize;

    // 6. Calculate Liquidation Price (強平價格)
    const mmRatio = params.maintenanceMargin / 100;
    let liquidationPrice = 0;

    if (leverage > 0) {
      if (params.direction === TradeDirection.LONG) {
        liquidationPrice = entryPrice * (1 - 1 / leverage + mmRatio);
        if (liquidationPrice < 0) liquidationPrice = 0;
      } else {
        liquidationPrice = entryPrice * (1 + 1 / leverage - mmRatio);
      }
    }
    liquidationPrice = roundTo(liquidationPrice, priceDecimals);

    // 7. Distance to liquidation %
    let distanceToLiqPercent = 0;
    if (liquidationPrice > 0 && entryPrice > 0) {
      distanceToLiqPercent = (Math.abs(entryPrice - liquidationPrice) / entryPrice) * 100;
    }

    // 8. Determine Calculation Price for PnL
    let calcPrice = 0;
    if (rawLevel.isCustomCalcPrice && rawLevel.calcPrice !== undefined) {
      calcPrice = rawLevel.calcPrice;
    } else {
      calcPrice = params.finalExitPrice;
    }
    calcPrice = roundTo(calcPrice, priceDecimals);

    // 9. Calculate Profit / Loss at current calcPrice
    const accumulatedProfit = directionMultiplier * (calcPrice - averagePrice) * cumSize;
    const shouldDeductFeeFromNet = params.deductFeeFromNetProfit ?? true;
    const netProfit = shouldDeductFeeFromNet ? (accumulatedProfit - accumulatedFees) : accumulatedProfit;

    // 10. Price change % compared to level 1 entry
    const initialPrice = result[0]?.entryPrice ?? params.initialPrice;
    const priceChangePercent = initialPrice > 0 ? ((entryPrice - initialPrice) / initialPrice) * 100 : 0;

    result.push({
      id: rawLevel.id,
      level: levelNumber,
      entryPrice: entryPrice,
      isCustomEntryPrice: rawLevel.isCustomEntryPrice ?? false,
      calcPrice: calcPrice,
      isCustomCalcPrice: rawLevel.isCustomCalcPrice ?? false,
      leverage: roundTo(leverage, 2),
      isCustomLeverage: rawLevel.isCustomLeverage ?? false,
      isDerivedLeverageFromPositionSize: isDerivedLeverageFromPositionSize,
      capital: roundTo(capital, 2),
      isCustomCapital: rawLevel.isCustomCapital ?? false,
      priceChangePercent: roundTo(priceChangePercent, 2),
      averagePrice: averagePrice,
      liquidationPrice: liquidationPrice,
      distanceToLiqPercent: roundTo(distanceToLiqPercent, 2),
      thisRoundPositionSize: thisRoundPositionSize,
      isCustomThisRoundPositionSize: rawLevel.isCustomThisRoundPositionSize ?? false,
      cumulativePositionSize: cumSize,
      accumulatedProfit: roundTo(accumulatedProfit, 2),
      feesPaid: roundTo(accumulatedFees, 2),
      netProfit: roundTo(netProfit, 2),
      isActive: rawLevel.isActive ?? false,
      note: rawLevel.note ?? '',
    });
  }

  // Determine effective final exit price if left empty or <= 0
  let effectiveFinalExitPrice = params.finalExitPrice;
  if (!effectiveFinalExitPrice || effectiveFinalExitPrice <= 0) {
    if (result.length > 0) {
      const lastLevelObj = result[result.length - 1];
      if (mode === RollingMode.DOUBLE) {
        const changePercent = 1 / lastLevelObj.leverage;
        effectiveFinalExitPrice = lastLevelObj.entryPrice * (1 + directionMultiplier * changePercent);
      } else {
        effectiveFinalExitPrice = lastLevelObj.entryPrice * (1 + directionMultiplier * (params.addPositionInterval / 100));
      }
    } else {
      effectiveFinalExitPrice = params.initialPrice;
    }
  }
  effectiveFinalExitPrice = roundTo(effectiveFinalExitPrice, priceDecimals);

  // Second pass: Update calcPrice to next level's entryPrice if not customized, then recompute profit metrics
  for (let i = 0; i < result.length; i++) {
    const rawLevel = currentLevels[i];
    const isCustomCalc = rawLevel.isCustomCalcPrice && rawLevel.calcPrice !== undefined;

    if (!isCustomCalc) {
      if (i < result.length - 1) {
        // Sync to next level's entry price
        result[i].calcPrice = roundTo(result[i + 1].entryPrice, priceDecimals);
      } else {
        // Sync to final exit price (using effectiveFinalExitPrice)
        result[i].calcPrice = roundTo(effectiveFinalExitPrice, priceDecimals);
      }

      // Recompute profit metrics
      const accumulatedProfit = directionMultiplier * (result[i].calcPrice - result[i].averagePrice) * result[i].cumulativePositionSize;
      const shouldDeductFeeFromNet = params.deductFeeFromNetProfit ?? true;
      const netProfit = shouldDeductFeeFromNet ? (accumulatedProfit - result[i].feesPaid) : accumulatedProfit;

      result[i].accumulatedProfit = roundTo(accumulatedProfit, 2);
      result[i].netProfit = roundTo(netProfit, 2);
    }
  }

  return result;
}
