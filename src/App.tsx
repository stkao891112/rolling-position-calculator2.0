import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  TrendingUp, 
  TrendingDown, 
  Trash2, 
  Plus, 
  RotateCcw, 
  Info, 
  Coins, 
  Percent, 
  ShieldAlert, 
  DollarSign, 
  Sliders, 
  HelpCircle,
  Save,
  Bookmark,
  ChevronLeft,
  ChevronRight,
  X,
  Check,
  Edit2,
  Filter,
  Flag,
  MapPin,
  CheckCircle2,
  Calendar,
  Layers,
  FileText,
  GripVertical,
  Cloud,
  CloudOff,
  Loader2,
  LogOut,
  RefreshCw,
  TrendingUp as LongIcon,
  TrendingDown as ShortIcon
} from 'lucide-react';
import { 
  RollingMode, 
  CapitalReinvestMode, 
  TradeDirection, 
  ContractType,
  CryptoPreset, 
  RollingLevel, 
  StrategyParams,
  SavedStrategy
} from './types';
import { PRESET_CRYPTOS } from './data';
import { recalculateLevels, roundTo } from './utils';
import { ParticlesBackground } from './components/ParticlesBackground';
import { onAuthStateChanged } from 'firebase/auth';
import { 
  auth, 
  signInWithGoogle, 
  signInWithGoogleRedirect,
  getRedirectSignInResult,
  logout, 
  getUserStrategies, 
  saveStrategyToFirestore, 
  deleteStrategyFromFirestore, 
  syncAllStrategiesToFirestore 
} from './firebase';


export default function App() {
  // 1. Core mode states
  const [rollingMode, setRollingMode] = useState<RollingMode>(RollingMode.CUSTOM_MULTIPLIER);
  const [reinvestMode, setReinvestMode] = useState<CapitalReinvestMode>(CapitalReinvestMode.PROFIT_REINVEST);
  const [customMultiplier, setCustomMultiplier] = useState<number>(1.0);
  
  // 2. Currency & Exchange settings
  const [selectedPreset, setSelectedPreset] = useState<string>('BTC');
  const [customCurrencyName, setCustomCurrencyName] = useState<string>('BTC');
  const [qtyDecimals, setQtyDecimals] = useState<number>(2);
  const [priceDecimals, setPriceDecimals] = useState<number>(0);
  const [contractType, setContractType] = useState<ContractType>(ContractType.USDT_MARGINED);
  const [selectedExchange, setSelectedExchange] = useState<string>(() => {
    return localStorage.getItem('rolling_last_selected_exchange') || 'Binance';
  });
  const [customExchangeName, setCustomExchangeName] = useState<string>(() => {
    return localStorage.getItem('rolling_last_custom_exchange') || '';
  });

  const PRESET_EXCHANGES = ['Binance', 'OKX', 'Bybit', 'Bitget', 'MEXC', 'Hyperliquid'];

  useEffect(() => {
    if (selectedExchange) {
      localStorage.setItem('rolling_last_selected_exchange', selectedExchange);
    }
  }, [selectedExchange]);

  useEffect(() => {
    if (customExchangeName !== undefined) {
      localStorage.setItem('rolling_last_custom_exchange', customExchangeName);
    }
  }, [customExchangeName]);

  // 3. Strategy parameters state
  const [strategyParams, setStrategyParams] = useState<StrategyParams>({
    initialCapital: 650,
    initialPrice: 59191,
    initialLeverage: 10,
    addPositionInterval: 3,
    feeRate: 0.02,
    finalExitPrice: 50000,
    direction: TradeDirection.SHORT, // default to Short to match the reference image beautifully
    maintenanceMargin: 0.5,
    deductFeeFromNetProfit: true,
    deductFeeFromPositionSizing: false,
  });

  // 4. Interactive table levels
  const [levelsState, setLevelsState] = useState<Array<{
    id: string;
    entryPrice?: number;
    leverage?: number;
    capital?: number;
    calcPrice?: number;
    isCustomCapital?: boolean;
  }>>([
    { id: 'lvl-1' },
    { id: 'lvl-2' },
    { id: 'lvl-3' },
    { id: 'lvl-4' },
    { id: 'lvl-5' },
  ]);

  // 5. Computed results
  const [computedLevels, setComputedLevels] = useState<RollingLevel[]>([]);

  // 6. User Authentication & Cloud Sync States
  const [user, setUser] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [syncStatus, setSyncStatus] = useState<'synced' | 'syncing' | 'error' | 'idle'>('idle');
  const [authError, setAuthError] = useState<string | null>(null);

  // Keep track of last successful synchronization time
  const [lastSyncedTime, setLastSyncedTime] = useState<string | null>(() => {
    return localStorage.getItem('last_rolling_synced_time');
  });

  // Automatically update last sync time when status changes to 'synced'
  useEffect(() => {
    if (syncStatus === 'synced') {
      const now = new Date();
      const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      setLastSyncedTime(timeStr);
      localStorage.setItem('last_rolling_synced_time', timeStr);
    }
  }, [syncStatus]);

  // Helper: Perform full sync between local storage and Firestore with timestamp-based conflict resolution & deleted items tracking
  const performSyncWithUser = async (currentUser: any) => {
    if (!currentUser) return;
    setSyncStatus('syncing');
    try {
      // 1. Process any pending deleted IDs stored in localStorage
      const deletedIdsStr = localStorage.getItem('deleted_rolling_strategy_ids');
      const deletedIds: string[] = deletedIdsStr ? JSON.parse(deletedIdsStr) : [];
      
      // First, delete all pending deleted IDs from Firestore
      if (deletedIds.length > 0) {
        for (const dId of deletedIds) {
          try {
            await deleteStrategyFromFirestore(currentUser.uid, dId);
          } catch (e) {
            console.error("Failed to delete pending strategy ID from cloud:", dId, e);
          }
        }
      }

      // 2. Fetch cloud strategies (after deleting pending items)
      const cloudStrats = await getUserStrategies(currentUser.uid);

      // 3. Fetch local strategies & last sync timestamp
      const localStratsStr = localStorage.getItem('saved_rolling_strategies');
      const localStrats: SavedStrategy[] = localStratsStr ? JSON.parse(localStratsStr) : [];

      const lastSyncTimeStr = localStorage.getItem('last_rolling_sync_timestamp');
      const lastSyncTimestamp = lastSyncTimeStr ? Number(lastSyncTimeStr) : 0;

      const mergedMap = new Map<string, SavedStrategy>();

      // Populate cloud strategies first, EXCLUDING any that are in deletedIds
      cloudStrats.forEach(s => {
        if (!deletedIds.includes(s.id)) {
          mergedMap.set(s.id, s);
        }
      });

      // Merge local strategies
      localStrats.forEach((localStrat: SavedStrategy) => {
        if (deletedIds.includes(localStrat.id)) {
          // Skip local strategies that are marked as deleted
          return;
        }

        if (mergedMap.has(localStrat.id)) {
          const cloudStrat = mergedMap.get(localStrat.id)!;
          const localTime = localStrat.timestamp || 0;
          const cloudTime = cloudStrat.timestamp || 0;
          // Whichever version has a higher timestamp (more recently edited/renamed) takes precedence!
          if (localTime > cloudTime) {
            mergedMap.set(localStrat.id, localStrat);
          }
        } else {
          // If not in cloud, check if it's a new local item or previously deleted on cloud
          const isLocallyNew = !lastSyncTimestamp || (localStrat.timestamp || 0) > lastSyncTimestamp || cloudStrats.length === 0;
          if (isLocallyNew) {
            mergedMap.set(localStrat.id, localStrat);
          }
        }
      });

      const mergedList = Array.from(mergedMap.values());

      // Sort by orderIndex first, then timestamp
      mergedList.sort((a, b) => {
        const idxA = a.orderIndex ?? 0;
        const idxB = b.orderIndex ?? 0;
        if (idxA !== idxB) return idxA - idxB;
        return (a.timestamp || 0) - (b.timestamp || 0);
      });

      // Update state and local storage
      setSavedStrategies(mergedList);
      localStorage.setItem('saved_rolling_strategies', JSON.stringify(mergedList));
      localStorage.setItem('last_rolling_sync_timestamp', Date.now().toString());
      localStorage.removeItem('deleted_rolling_strategy_ids');

      // Batch write to Firestore (creates/updates existing, deletes removed)
      await syncAllStrategiesToFirestore(currentUser.uid, mergedList);
      setSyncStatus('synced');
    } catch (err) {
      console.error("Error during strategy sync:", err);
      setSyncStatus('error');
    }
  };

  // Manual synchronization to Firestore
  const handleManualSync = async () => {
    if (!user) return;
    await performSyncWithUser(user);
  };

  // Handle redirect sign-in result on page load
  useEffect(() => {
    const checkRedirectResult = async () => {
      try {
        const redirectedUser = await getRedirectSignInResult();
        if (redirectedUser) {
          console.log("Redirect sign-in successful:", redirectedUser);
          setUser(redirectedUser);
        }
      } catch (err: any) {
        console.error("Error getting redirect sign-in result:", err);
        if (err?.code === 'auth/unauthorized-domain' || (err?.message && err.message.includes('unauthorized-domain'))) {
          setAuthError("未授權網域：請至 Firebase 控制台將您的 Vercel 網域新增至「授權網域」中。");
        } else {
          setAuthError("重新導向登入失敗：" + (err?.message || "請稍後再試。"));
        }
      }
    };
    checkRedirectResult();
  }, []);

  const handleGoogleSignIn = async () => {
    setAuthError(null);
    try {
      await signInWithGoogle();
    } catch (err: any) {
      console.error("Google sign in error in App.tsx:", err);
      if (err?.code === 'auth/popup-blocked' || err?.message?.includes('popup-blocked')) {
        console.log("Popup blocked. Falling back to Google Redirect Sign-In...");
        try {
          await signInWithGoogleRedirect();
        } catch (redirErr: any) {
          console.error("Redirect sign-in error:", redirErr);
          setAuthError("彈出視窗被封鎖，嘗試重新導向時失敗：" + (redirErr?.message || "請重試。"));
        }
      } else if (err?.code === 'auth/unauthorized-domain' || (err?.message && err.message.includes('unauthorized-domain'))) {
        setAuthError("未授權網域：請至 Firebase 控制台將您的 Vercel 網域新增至「授權網域」中。");
      } else {
        setAuthError(err?.message || "登入失敗，請稍後再試。");
      }
    }
  };

  const handleGoogleSignInRedirect = async () => {
    setAuthError(null);
    setAuthLoading(true);
    try {
      await signInWithGoogleRedirect();
    } catch (err: any) {
      console.error("Google redirect sign in error:", err);
      setAuthLoading(false);
      if (err?.code === 'auth/unauthorized-domain' || (err?.message && err.message.includes('unauthorized-domain'))) {
        setAuthError("未授權網域：請至 Firebase 控制台將您的 Vercel 網域新增至「授權網域」中。");
      } else {
        setAuthError(err?.message || "登入失敗，請稍後再試。");
      }
    }
  };

  // 7. Saved Strategies State & Operations
  const [savedStrategies, setSavedStrategies] = useState<SavedStrategy[]>(() => {
    try {
      const saved = localStorage.getItem('saved_rolling_strategies');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      console.error('Error loading saved strategies', e);
      return [];
    }
  });

  const [currentSavedId, setCurrentSavedId] = useState<string | null>(null);
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [editingStrategyId, setEditingStrategyId] = useState<string | null>(null);
  const [filterCurrency, setFilterCurrency] = useState<string>('ALL');
  const [filterExchange, setFilterExchange] = useState<string>('ALL');
  const [activeLevelIndex, setActiveLevelIndex] = useState<number | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [overwriteConfirmId, setOverwriteConfirmId] = useState<string | null>(null);
  const [editingNameId, setEditingNameId] = useState<string | null>(null);
  const [editingNameValue, setEditingNameValue] = useState('');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [lastSavedSnapshot, setLastSavedSnapshot] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<
    | { type: 'LOAD'; strategy: SavedStrategy }
    | { type: 'NEW' }
    | { type: 'RESET' }
    | null
  >(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2500);
  };

  // Helper to build current state snapshot string
  const getCurrentStateSnapshot = (overrideParams?: any, overrideLevels?: any, overrideActiveIdx?: number | null) => {
    const rawParams = overrideParams || strategyParams;
    const rawLevels = overrideLevels || levelsState;
    const currentActiveIdx = overrideActiveIdx !== undefined ? overrideActiveIdx : activeLevelIndex;

    const normalizedParams = {
      ...rawParams,
      deductFeeFromNetProfit: rawParams.deductFeeFromNetProfit ?? true,
      deductFeeFromPositionSizing: rawParams.deductFeeFromPositionSizing ?? false,
    };

    const normalizedLevels = rawLevels.map((lvl: any, idx: number) => ({
      ...lvl,
      isActive: idx === currentActiveIdx,
    }));

    return JSON.stringify({
      strategyParams: normalizedParams,
      levelsState: normalizedLevels,
      rollingMode,
      reinvestMode,
      customMultiplier,
      selectedPreset,
      customCurrencyName,
      qtyDecimals,
      priceDecimals,
      contractType,
      selectedExchange,
      customExchangeName,
      activeLevelIndex: currentActiveIdx,
    });
  };

  // Check if current state has unsaved changes before executing an action
  const checkUnsavedBeforeAction = (action: () => void, pendingObj: any) => {
    const currentSnap = getCurrentStateSnapshot();
    if (lastSavedSnapshot !== null && currentSnap !== lastSavedSnapshot) {
      setPendingAction(pendingObj);
    } else {
      action();
    }
  };

  const handleToggleActiveLevel = (index: number) => {
    setActiveLevelIndex(prev => (prev === index ? null : index));
  };

  const handleUpdateLevelNote = (index: number, noteText: string) => {
    setLevelsState(prev => {
      const copy = [...prev];
      copy[index] = {
        ...copy[index],
        note: noteText,
      };
      return copy;
    });
  };

  // Monitor Auth Changes and sync strategies
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);
      if (currentUser) {
        await performSyncWithUser(currentUser);
      } else {
        // If logged out, restore local strategies from localStorage
        const local = localStorage.getItem('saved_rolling_strategies');
        setSavedStrategies(local ? JSON.parse(local) : []);
        setSyncStatus('idle');
      }
    });
    return () => unsubscribe();
  }, []);

  const generateDefaultName = (currency: string, cType: ContractType) => {
    const marginText = cType === ContractType.COIN_MARGINED ? '幣本位' : 'U本位';
    const basePrefix = `${currency} ${marginText} 組合`;
    let count = 1;
    const existingNames = new Set(savedStrategies.map(s => s.name));
    while (existingNames.has(`${basePrefix}${count}`)) {
      count++;
    }
    return `${basePrefix}${count}`;
  };

  const handleLoadStrategy = (strategy: SavedStrategy) => {
    setRollingMode(strategy.rollingMode);
    setReinvestMode(strategy.reinvestMode);
    setCustomMultiplier(strategy.customMultiplier);
    setSelectedPreset(strategy.selectedPreset);
    setCustomCurrencyName(strategy.customCurrencyName);
    setQtyDecimals(strategy.qtyDecimals);
    setPriceDecimals(strategy.priceDecimals);
    setContractType(strategy.contractType || ContractType.USDT_MARGINED);
    const ex = strategy.exchange || strategy.strategyParams?.exchange || 'Binance';
    if (PRESET_EXCHANGES.includes(ex)) {
      setSelectedExchange(ex);
    } else {
      setSelectedExchange('CUSTOM');
      setCustomExchangeName(ex);
    }
    const deductNet = strategy.deductFeeFromNetProfit ?? strategy.strategyParams.deductFeeFromNetProfit ?? true;
    const deductPos = strategy.deductFeeFromPositionSizing ?? strategy.strategyParams.deductFeeFromPositionSizing ?? false;
    const loadedParams = {
      ...strategy.strategyParams,
      deductFeeFromNetProfit: deductNet,
      deductFeeFromPositionSizing: deductPos,
    };
    let loadedActiveIdx: number | null = null;
    if (strategy.activeLevelIndex !== undefined) {
      loadedActiveIdx = strategy.activeLevelIndex;
    } else {
      const activeIdx = strategy.levelsState.findIndex(l => l.isActive);
      loadedActiveIdx = activeIdx !== -1 ? activeIdx : null;
    }
    setStrategyParams(loadedParams);
    setActiveLevelIndex(loadedActiveIdx);
    setLevelsState(strategy.levelsState);
    setCurrentSavedId(strategy.id);

    // Update saved snapshot
    const snap = JSON.stringify({
      strategyParams: loadedParams,
      levelsState: strategy.levelsState,
      rollingMode: strategy.rollingMode,
      reinvestMode: strategy.reinvestMode,
      customMultiplier: strategy.customMultiplier,
      selectedPreset: strategy.selectedPreset,
      customCurrencyName: strategy.customCurrencyName,
      qtyDecimals: strategy.qtyDecimals,
      priceDecimals: strategy.priceDecimals,
      contractType: strategy.contractType || ContractType.USDT_MARGINED,
      selectedExchange: PRESET_EXCHANGES.includes(ex) ? ex : 'CUSTOM',
      customExchangeName: PRESET_EXCHANGES.includes(ex) ? '' : ex,
      activeLevelIndex: loadedActiveIdx,
    });
    setLastSavedSnapshot(snap);
  };

  const handleSaveNewStrategy = async (nameToSave: string) => {
    if (!nameToSave.trim()) return;
    const effectiveExchange = selectedExchange === 'CUSTOM' ? (customExchangeName.trim() || '自訂交易所') : selectedExchange;
    const preparedLevels = levelsState.map((lvl, idx) => ({
      ...lvl,
      isActive: idx === activeLevelIndex,
    }));
    const updatedParams = {
      ...strategyParams,
      contractType,
      exchange: effectiveExchange,
      deductFeeFromNetProfit: strategyParams.deductFeeFromNetProfit ?? true,
      deductFeeFromPositionSizing: strategyParams.deductFeeFromPositionSizing ?? false,
    };
    setLevelsState(preparedLevels);
    setStrategyParams(updatedParams);

    const newStrategy: SavedStrategy = {
      id: 'strat-' + Date.now(),
      name: nameToSave.trim(),
      timestamp: Date.now(),
      rollingMode,
      reinvestMode,
      customMultiplier,
      selectedPreset,
      customCurrencyName,
      qtyDecimals,
      priceDecimals,
      contractType,
      exchange: effectiveExchange,
      deductFeeFromNetProfit: strategyParams.deductFeeFromNetProfit ?? true,
      deductFeeFromPositionSizing: strategyParams.deductFeeFromPositionSizing ?? false,
      activeLevelIndex,
      strategyParams: updatedParams,
      levelsState: preparedLevels,
    };
    const updated = [newStrategy, ...savedStrategies];
    setSavedStrategies(updated);
    localStorage.setItem('saved_rolling_strategies', JSON.stringify(updated));
    setCurrentSavedId(newStrategy.id);
    setIsSaveModalOpen(false);
    setSaveName('');
    showToast(`已建立新組合「${newStrategy.name}」！`);

    // Update snapshot after saving
    setLastSavedSnapshot(getCurrentStateSnapshot(updatedParams, preparedLevels));

    if (user) {
      setSyncStatus('syncing');
      try {
        await syncAllStrategiesToFirestore(user.uid, updated);
        setSyncStatus('synced');
      } catch (err) {
        setSyncStatus('error');
      }
    }
  };

  // Open modal to modify an existing strategy
  const handleOpenModifyModal = (strategy: SavedStrategy, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setEditingStrategyId(strategy.id);
    setCustomCurrencyName(strategy.customCurrencyName);
    setSelectedPreset(strategy.selectedPreset || strategy.customCurrencyName);
    setContractType(strategy.contractType || ContractType.USDT_MARGINED);
    const ex = strategy.exchange || 'Binance';
    if (PRESET_EXCHANGES.includes(ex)) {
      setSelectedExchange(ex);
    } else {
      setSelectedExchange('CUSTOM');
      setCustomExchangeName(ex);
    }
    setSaveName(strategy.name);
    setIsSaveModalOpen(true);
  };

  const handleCloseSaveModal = () => {
    setIsSaveModalOpen(false);
    setEditingStrategyId(null);
    if (currentSavedId) {
      const active = savedStrategies.find(s => s.id === currentSavedId);
      if (active) {
        setCustomCurrencyName(active.customCurrencyName);
        setSelectedPreset(active.selectedPreset || active.customCurrencyName);
        setContractType(active.contractType || ContractType.USDT_MARGINED);
        const ex = active.exchange || 'Binance';
        if (PRESET_EXCHANGES.includes(ex)) {
          setSelectedExchange(ex);
        } else {
          setSelectedExchange('CUSTOM');
          setCustomExchangeName(ex);
        }
      }
    }
  };

  // Confirm Modal save (handles both creation & modification)
  const handleConfirmModalSave = async () => {
    const effectiveExchange = selectedExchange === 'CUSTOM' ? (customExchangeName.trim() || '自訂交易所') : selectedExchange;
    const preparedLevels = levelsState.map((lvl, idx) => ({
      ...lvl,
      isActive: idx === activeLevelIndex,
    }));

    if (editingStrategyId) {
      // Modify existing strategy
      let modifiedStrat: SavedStrategy | null = null;
      const updated = savedStrategies.map(strat => {
        if (strat.id === editingStrategyId) {
          modifiedStrat = {
            ...strat,
            name: saveName.trim(),
            timestamp: Date.now(),
            selectedPreset,
            customCurrencyName,
            contractType,
            exchange: effectiveExchange,
            deductFeeFromNetProfit: strategyParams.deductFeeFromNetProfit ?? true,
            deductFeeFromPositionSizing: strategyParams.deductFeeFromPositionSizing ?? false,
            activeLevelIndex,
            strategyParams: {
              ...strat.strategyParams,
              customCurrencyName,
              contractType,
              exchange: effectiveExchange,
              deductFeeFromNetProfit: strategyParams.deductFeeFromNetProfit ?? true,
              deductFeeFromPositionSizing: strategyParams.deductFeeFromPositionSizing ?? false,
            },
            levelsState: preparedLevels,
          };
          return modifiedStrat;
        }
        return strat;
      });
      setSavedStrategies(updated);
      localStorage.setItem('saved_rolling_strategies', JSON.stringify(updated));
      showToast(`已修改組合「${saveName.trim()}」！`);
      setIsSaveModalOpen(false);
      setEditingStrategyId(null);

      // Update snapshot after modifying so switching page or card never prompts unsaved warning
      setLastSavedSnapshot(getCurrentStateSnapshot(undefined, preparedLevels));

      if (user) {
        setSyncStatus('syncing');
        try {
          await syncAllStrategiesToFirestore(user.uid, updated);
          setSyncStatus('synced');
        } catch (err) {
          setSyncStatus('error');
        }
      }
    } else {
      // Create new strategy
      await handleSaveNewStrategy(saveName);
    }
  };

  const handleOverwriteStrategy = async (id: string) => {
    const effectiveExchange = selectedExchange === 'CUSTOM' ? (customExchangeName.trim() || '自訂交易所') : selectedExchange;
    const preparedLevels = levelsState.map((lvl, idx) => ({
      ...lvl,
      isActive: idx === activeLevelIndex,
    }));
    const updatedParams = {
      ...strategyParams,
      contractType,
      exchange: effectiveExchange,
      deductFeeFromNetProfit: strategyParams.deductFeeFromNetProfit ?? true,
      deductFeeFromPositionSizing: strategyParams.deductFeeFromPositionSizing ?? false,
    };
    setLevelsState(preparedLevels);
    setStrategyParams(updatedParams);

    const updated = savedStrategies.map(strat => {
      if (strat.id === id) {
        return {
          ...strat,
          timestamp: Date.now(),
          rollingMode,
          reinvestMode,
          customMultiplier,
          selectedPreset,
          customCurrencyName,
          qtyDecimals,
          priceDecimals,
          contractType,
          exchange: effectiveExchange,
          deductFeeFromNetProfit: strategyParams.deductFeeFromNetProfit ?? true,
          deductFeeFromPositionSizing: strategyParams.deductFeeFromPositionSizing ?? false,
          activeLevelIndex,
          strategyParams: updatedParams,
          levelsState: preparedLevels,
        };
      }
      return strat;
    });
    setSavedStrategies(updated);
    localStorage.setItem('saved_rolling_strategies', JSON.stringify(updated));
    const currentObj = updated.find(s => s.id === id);
    showToast(`已更新儲存「${currentObj?.name || '組合'}」！`);

    // Update snapshot after overwriting
    setLastSavedSnapshot(getCurrentStateSnapshot(updatedParams, preparedLevels));

    if (user) {
      setSyncStatus('syncing');
      try {
        await syncAllStrategiesToFirestore(user.uid, updated);
        setSyncStatus('synced');
      } catch (err) {
        setSyncStatus('error');
      }
    }
  };

  // Execute pending action after unsaved changes prompt decision
  const handleExecutePendingAction = async (saveFirst: boolean) => {
    const currentAction = pendingAction;
    setPendingAction(null);
    if (!currentAction) return;

    if (saveFirst) {
      if (currentSavedId) {
        await handleOverwriteStrategy(currentSavedId);
      } else {
        const autoName = generateDefaultName(customCurrencyName, contractType);
        await handleSaveNewStrategy(autoName);
      }
    }

    if (currentAction.type === 'LOAD') {
      handleLoadStrategy(currentAction.strategy);
    } else if (currentAction.type === 'NEW') {
      setEditingStrategyId(null);
      setCurrentSavedId(null);
      setSaveName(generateDefaultName(customCurrencyName, contractType));
      setIsSaveModalOpen(true);
    } else if (currentAction.type === 'RESET') {
      handleReset();
    }
  };

  const handleDeleteStrategy = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = savedStrategies.filter(strat => strat.id !== id);
    setSavedStrategies(updated);
    localStorage.setItem('saved_rolling_strategies', JSON.stringify(updated));
    if (currentSavedId === id) {
      setCurrentSavedId(null);
    }

    // Add to pending deleted IDs in localStorage for offline or retry sync tracking
    const deletedIdsStr = localStorage.getItem('deleted_rolling_strategy_ids');
    const deletedIds = deletedIdsStr ? JSON.parse(deletedIdsStr) : [];
    if (!deletedIds.includes(id)) {
      deletedIds.push(id);
      localStorage.setItem('deleted_rolling_strategy_ids', JSON.stringify(deletedIds));
    }

    if (user) {
      setSyncStatus('syncing');
      try {
        await deleteStrategyFromFirestore(user.uid, id);
        await syncAllStrategiesToFirestore(user.uid, updated);
        // Clean up from pending deleted IDs upon successful deletion
        const currentDeleted = JSON.parse(localStorage.getItem('deleted_rolling_strategy_ids') || '[]');
        localStorage.setItem('deleted_rolling_strategy_ids', JSON.stringify(currentDeleted.filter((d: string) => d !== id)));
        setSyncStatus('synced');
      } catch (err) {
        setSyncStatus('error');
      }
    }
  };

  // Rename a saved strategy
  const handleRenameStrategy = async (id: string, newName: string) => {
    if (!newName.trim()) return;
    const updated = savedStrategies.map(strat => {
      if (strat.id === id) {
        return { ...strat, name: newName.trim(), timestamp: Date.now() };
      }
      return strat;
    });
    setSavedStrategies(updated);
    localStorage.setItem('saved_rolling_strategies', JSON.stringify(updated));
    const currentObj = updated.find(s => s.id === id);
    showToast(`已修改名稱為「${currentObj?.name || newName}」！`);

    // Reset saved snapshot so renaming a strategy never triggers unsaved warnings
    setLastSavedSnapshot(getCurrentStateSnapshot());

    if (user) {
      setSyncStatus('syncing');
      try {
        await syncAllStrategiesToFirestore(user.uid, updated);
        setSyncStatus('synced');
      } catch (err) {
        setSyncStatus('error');
      }
    }
  };

  // Quick save: if there's a current active strategy, overwrite it; otherwise create new
  const handleQuickSave = async () => {
    if (currentSavedId) {
      await handleOverwriteStrategy(currentSavedId);
    } else {
      const autoName = `${customCurrencyName}${strategyParams.direction === TradeDirection.LONG ? '做多' : '做空'} ${levelsState.length}層 組合`;
      await handleSaveNewStrategy(autoName);
    }
  };

  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', index.toString());
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;

    const updated = [...savedStrategies];
    const [draggedItem] = updated.splice(draggedIndex, 1);
    updated.splice(index, 0, draggedItem);

    setDraggedIndex(index);
    setSavedStrategies(updated);
    localStorage.setItem('saved_rolling_strategies', JSON.stringify(updated));
  };

  const handleDragEnd = async () => {
    setDraggedIndex(null);

    // Auto save reordered strategies & update snapshot so ordering never triggers unsaved warnings
    localStorage.setItem('saved_rolling_strategies', JSON.stringify(savedStrategies));
    setLastSavedSnapshot(getCurrentStateSnapshot());
    showToast('組合排序已自動儲存！');

    if (user) {
      setSyncStatus('syncing');
      try {
        await syncAllStrategiesToFirestore(user.uid, savedStrategies);
        setSyncStatus('synced');
      } catch (err) {
        setSyncStatus('error');
      }
    }
  };


  // Re-sync final exit price when trade direction toggles
  const handleDirectionToggle = (dir: TradeDirection) => {
    setStrategyParams(prev => {
      const multiplier = dir === TradeDirection.LONG ? 1.15 : 0.85;
      return {
        ...prev,
        direction: dir,
        finalExitPrice: Math.round(prev.initialPrice * multiplier)
      };
    });
  };

  // Run the core calculation engine
  useEffect(() => {
    const calculated = recalculateLevels(
      levelsState,
      strategyParams,
      rollingMode,
      reinvestMode,
      customMultiplier,
      qtyDecimals,
      priceDecimals
    );
    setComputedLevels(calculated);
  }, [levelsState, strategyParams, rollingMode, reinvestMode, customMultiplier, qtyDecimals, priceDecimals]);

  // Set page title
  useEffect(() => {
    document.title = "滾倉計算機2";
  }, []);

  // Reset helper
  const handleReset = () => {
    const btc = PRESET_CRYPTOS[0];
    const defaultParams = {
      initialCapital: 650,
      initialPrice: btc.defaultPrice,
      initialLeverage: 10,
      addPositionInterval: 3,
      feeRate: 0.02,
      finalExitPrice: 50000,
      direction: TradeDirection.SHORT,
      maintenanceMargin: 0.5,
    };
    const defaultLevels = [
      { id: 'lvl-1' },
      { id: 'lvl-2' },
      { id: 'lvl-3' },
      { id: 'lvl-4' },
      { id: 'lvl-5' },
    ];

    setSelectedPreset('BTC');
    setCustomCurrencyName('BTC');
    setQtyDecimals(btc.defaultDecimals);
    setPriceDecimals(btc.defaultPriceDecimals ?? 1);
    setRollingMode(RollingMode.DOUBLE);
    setReinvestMode(CapitalReinvestMode.PROFIT_REINVEST);
    setCustomMultiplier(1.5);
    setContractType(ContractType.USDT_MARGINED);
    setSelectedExchange('Binance');
    setCustomExchangeName('');
    setActiveLevelIndex(null);
    setStrategyParams(defaultParams);
    setLevelsState(defaultLevels);
    setCurrentSavedId(null);

    // Reset snapshot to initial defaults
    const snap = JSON.stringify({
      strategyParams: defaultParams,
      levelsState: defaultLevels,
      rollingMode: RollingMode.DOUBLE,
      reinvestMode: CapitalReinvestMode.PROFIT_REINVEST,
      customMultiplier: 1.5,
      selectedPreset: 'BTC',
      customCurrencyName: 'BTC',
      qtyDecimals: btc.defaultDecimals,
      priceDecimals: btc.defaultPriceDecimals ?? 1,
      contractType: ContractType.USDT_MARGINED,
      selectedExchange: 'Binance',
      customExchangeName: '',
      activeLevelIndex: null,
    });
    setLastSavedSnapshot(snap);
  };

  // Add next level
  const handleAddLevel = () => {
    setLevelsState(prev => [
      ...prev,
      {
        id: `lvl-${Date.now()}`,
      }
    ]);
  };

  // Remove individual level
  const handleRemoveLevel = (id: string, index: number) => {
    if (index === 0) return; // Cannot delete initial level
    setLevelsState(prev => prev.filter(l => l.id !== id));
  };

  // Update specific level value
  const handleUpdateLevel = (index: number, field: string, rawVal: string) => {
    const value = rawVal === "" ? undefined : parseFloat(rawVal);
    let isCustomField = '';
    if (field === 'entryPrice') isCustomField = 'isCustomEntryPrice';
    else if (field === 'calcPrice') isCustomField = 'isCustomCalcPrice';
    else if (field === 'leverage') isCustomField = 'isCustomLeverage';
    else if (field === 'capital') isCustomField = 'isCustomCapital';
    else if (field === 'thisRoundPositionSize') isCustomField = 'isCustomThisRoundPositionSize';

    setLevelsState(prev => {
      const copy = [...prev];
      copy[index] = {
        ...copy[index],
        [field]: value,
      };
      if (isCustomField) {
        copy[index] = {
          ...copy[index],
          [isCustomField]: value !== undefined,
        };
        // If setting thisRoundPositionSize, clear leverage custom flag so position size takes precedence
        if (field === 'thisRoundPositionSize' && value !== undefined) {
          copy[index].isCustomLeverage = false;
          delete copy[index].leverage;
        }
        // If setting leverage, clear thisRoundPositionSize custom flag so leverage takes precedence
        if (field === 'leverage' && value !== undefined) {
          copy[index].isCustomThisRoundPositionSize = false;
          delete copy[index].thisRoundPositionSize;
        }
      }
      return copy;
    });
  };

  // Reset/Restore specific customized field back to automatic calculation
  const handleResetLevelField = (index: number, field: string) => {
    let isCustomField = '';
    if (field === 'entryPrice') isCustomField = 'isCustomEntryPrice';
    else if (field === 'calcPrice') isCustomField = 'isCustomCalcPrice';
    else if (field === 'leverage') isCustomField = 'isCustomLeverage';
    else if (field === 'capital') isCustomField = 'isCustomCapital';
    else if (field === 'thisRoundPositionSize') isCustomField = 'isCustomThisRoundPositionSize';

    setLevelsState(prev => {
      const copy = [...prev];
      const updatedRow = { ...copy[index] };
      delete updatedRow[field as keyof typeof updatedRow];
      if (isCustomField) {
        (updatedRow as any)[isCustomField] = false;
      }
      if (field === 'thisRoundPositionSize') {
        updatedRow.isCustomThisRoundPositionSize = false;
      }
      copy[index] = updatedRow;
      return copy;
    });
  };

  // Quick reset all manual overrides on a level to restore auto calculation
  const handleRestoreAutoLevel = (index: number) => {
    setLevelsState(prev => {
      const copy = [...prev];
      copy[index] = {
        id: copy[index].id,
      };
      return copy;
    });
  };

  // Summary variables
  const lastLevel = computedLevels[computedLevels.length - 1];
  const totalNetProfit = lastLevel ? lastLevel.netProfit : 0;
  const initialCap = strategyParams.initialCapital;
  const finalReturnPercent = initialCap > 0 ? (totalNetProfit / initialCap) * 100 : 0;
  const finalReturnMultiple = initialCap > 0 ? (initialCap + totalNetProfit) / initialCap : 1;
  const totalFees = lastLevel ? lastLevel.feesPaid : 0;
  
  // Total leverage multiplier in terms of maximum exposure compared to initial equity
  const totalExposure = lastLevel ? lastLevel.cumulativePositionSize * (lastLevel.entryPrice || 1) : 0;
  const effectiveLeverage = initialCap > 0 ? totalExposure / initialCap : 0;

  // New metrics: Price distance from initial entry price to final exit price
  const entryP = strategyParams.initialPrice;
  const exitP = (strategyParams.finalExitPrice && strategyParams.finalExitPrice > 0) 
    ? strategyParams.finalExitPrice 
    : (lastLevel ? lastLevel.calcPrice : strategyParams.initialPrice);
  const priceDistancePercent = entryP > 0 ? ((exitP - entryP) / entryP) * 100 : 0;

  // New metrics: No-rolling / Simple position holding profit to the final exit price
  const noRollingSize = entryP > 0 ? (initialCap * strategyParams.initialLeverage) / entryP : 0;
  const dirMult = strategyParams.direction === TradeDirection.LONG ? 1 : -1;
  const noRollingGross = dirMult * (exitP - entryP) * noRollingSize;
  const noRollingEntryFee = (initialCap * strategyParams.initialLeverage) * (strategyParams.feeRate / 100);
  const noRollingExitFee = (noRollingSize * exitP) * (strategyParams.feeRate / 100);
  const noRollingTotalFees = noRollingEntryFee + noRollingExitFee;
  const noRollingNetProfit = noRollingGross - noRollingTotalFees;
  const noRollingROI = initialCap > 0 ? (noRollingNetProfit / initialCap) * 100 : 0;
  const noRollingMultiple = initialCap > 0 ? (initialCap + noRollingNetProfit) / initialCap : 1;

  return (
    <div className="min-h-screen bg-[#030712] text-slate-100 font-sans antialiased flex flex-col md:flex-row relative animate-fade-in overflow-hidden" id="app-root">
      
      {/* 粒子背景動畫 */}
      <ParticlesBackground />
      
      {/* 側邊欄 (已儲存設定組合) */}
      <div className={`
        fixed md:sticky top-0 left-0 bottom-0 z-50
        h-screen border-r border-indigo-500/10 glass-panel flex flex-col
        transition-all duration-300 shadow-2xl md:shadow-none
        ${sidebarOpen ? 'w-80 translate-x-0' : 'w-0 -translate-x-full md:translate-x-0 md:w-0 overflow-hidden border-r-0'}
      `} id="sidebar-container">
        
        {/* 側邊欄標頭 */}
        <div className="p-4 border-b border-indigo-500/10 flex items-center justify-between bg-[#060a16]/80">
          <div className="flex items-center gap-2">
            <Bookmark className="w-5 h-5 text-indigo-400" />
            <h2 className="text-sm font-bold text-white tracking-wider">已儲存設定組合</h2>
            <span className="text-[10px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded-full font-mono">
              {savedStrategies.length}
            </span>
          </div>
          <button 
            onClick={() => setSidebarOpen(false)}
            className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-all"
            title="關閉側邊欄"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Google 登入與雲端同步面板 */}
        <div className="p-3.5 border-b border-indigo-500/10 bg-[#060a16]/60">
          {authLoading ? (
            <div className="flex items-center justify-center py-2 text-slate-400 gap-2 text-xs">
              <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
              <span>載入登入狀態...</span>
            </div>
          ) : !user ? (
            <div className="flex flex-col gap-2">
              <div className="flex items-start gap-1.5">
                <CloudOff className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                <div className="flex flex-col">
                  <span className="text-xs font-semibold text-slate-300">本地暫存模式</span>
                  <span className="text-[10px] text-slate-500 leading-relaxed">
                    登入 Google 即可自動同步至雲端，跨裝置存取您的自訂組合。
                  </span>
                </div>
              </div>
              <button
                onClick={handleGoogleSignIn}
                className="w-full flex items-center justify-center gap-2 bg-white hover:bg-slate-100 text-slate-900 rounded-xl py-2.5 px-3 text-xs font-bold transition-all cursor-pointer shadow-md active:scale-[0.98]"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path fill="#EA4335" d="M12.24 10.285V14.4h6.887c-.648 2.41-2.519 4.114-5.136 4.114A5.79 5.79 0 0 1 8.2 12.725a5.79 5.79 0 0 1 5.791-5.789c1.474 0 2.81.54 3.844 1.428l3.12-3.116C19.043 3.486 16.273 2.5 13.99 2.5 8.167 2.5 3.4 7.21 3.4 13s4.767 10.5 10.59 10.5c6.079 0 10.114-4.218 10.114-10.114 0-.648-.053-1.285-.16-1.928H12.24Z" />
                </svg>
                <span>使用 Google 登入</span>
              </button>
              <button
                onClick={handleGoogleSignInRedirect}
                className="w-full text-[10px] text-center text-indigo-400 hover:text-indigo-300 transition-all mt-1 underline cursor-pointer"
              >
                若彈出視窗被封鎖，請點此重新導向登入
              </button>
              {authError && (
                <div className="text-[10px] text-rose-400 bg-rose-950/30 border border-rose-900/40 rounded-lg p-2 mt-2 leading-relaxed">
                  {authError}
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <img 
                    src={user.photoURL || `https://api.dicebear.com/7.x/bottts/svg?seed=${user.uid}`} 
                    alt="avatar" 
                    className="w-8 h-8 rounded-full border border-slate-700 object-cover"
                    referrerPolicy="no-referrer"
                  />
                  <div className="flex flex-col min-w-0">
                    <span className="text-xs font-bold text-slate-200 truncate">{user.displayName || '使用者'}</span>
                    <span className="text-[9px] text-slate-400 truncate">{user.email}</span>
                  </div>
                </div>
                <button
                  onClick={logout}
                  className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-950/20 rounded-lg transition-all"
                  title="登出帳號"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
              
              {/* 同步狀態 */}
              <div className="flex items-center justify-between bg-slate-950/50 rounded-lg px-2.5 py-1.5 border border-slate-800/50 mt-1">
                <span className="text-[10px] text-slate-400">雲端同步狀態:</span>
                <div className="flex items-center gap-1.5">
                  {syncStatus === 'syncing' && (
                    <>
                      <Loader2 className="w-3 h-3 text-indigo-400 animate-spin" />
                      <span className="text-[10px] text-indigo-300 font-bold">同步中</span>
                    </>
                  )}
                  {syncStatus === 'synced' && (
                    <>
                      <Cloud className="w-3 h-3 text-emerald-400 animate-pulse" />
                      <span className="text-[10px] text-emerald-400 font-bold">已同步</span>
                    </>
                  )}
                  {syncStatus === 'error' && (
                    <>
                      <CloudOff className="w-3 h-3 text-rose-400" />
                      <span className="text-[10px] text-rose-400 font-bold">同步出錯</span>
                    </>
                  )}
                  {syncStatus === 'idle' && (
                    <>
                      <Cloud className="w-3 h-3 text-slate-400" />
                      <span className="text-[10px] text-slate-400 font-bold">已連線</span>
                    </>
                  )}
                </div>
              </div>

              {/* 上次同步時間與手動同步按鈕 */}
              <div className="flex items-center justify-between mt-1 px-1">
                <span className="text-[9px] text-slate-500">
                  上次同步: {lastSyncedTime ? lastSyncedTime : '尚未同步'}
                </span>
                <button
                  id="btn-manual-sync"
                  onClick={handleManualSync}
                  disabled={syncStatus === 'syncing'}
                  className="flex items-center gap-1 text-[10px] text-indigo-400 hover:text-indigo-300 disabled:text-slate-600 transition-all cursor-pointer select-none font-semibold bg-indigo-500/10 hover:bg-indigo-500/20 px-2.5 py-1 rounded-md border border-indigo-500/20 active:scale-[0.98]"
                  title="立即將本地組合與雲端進行同步"
                >
                  <RefreshCw className={`w-2.5 h-2.5 ${syncStatus === 'syncing' ? 'animate-spin text-indigo-400' : ''}`} />
                  <span>手動同步</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 快速按鈕群組：新增組合 + 儲存當前組合 */}
        <div className="p-3 border-b border-indigo-500/10 bg-[#060a16]/50 flex flex-col gap-2">
          {/* 按鈕 1：新增一個組合 */}
          <button
            onClick={() => {
              checkUnsavedBeforeAction(
                () => {
                  setEditingStrategyId(null);
                  setCurrentSavedId(null);
                  setSaveName(generateDefaultName(customCurrencyName, contractType));
                  setIsSaveModalOpen(true);
                },
                { type: 'NEW' }
              );
            }}
            className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 border border-indigo-500/40 rounded-xl py-2 px-3 text-xs font-bold text-white transition-all shadow-md shadow-indigo-600/20 cursor-pointer active:scale-[0.98]"
            title="建立一個全新的組合設定"
          >
            <Plus className="w-4 h-4" />
            <span>新增一個組合</span>
          </button>

          {/* 按鈕 2：儲存當前組合 */}
          <button
            onClick={handleQuickSave}
            className="w-full flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 border border-slate-700 hover:border-indigo-500/50 rounded-xl py-2 px-3 text-xs font-bold text-slate-200 hover:text-white transition-all cursor-pointer active:scale-[0.98]"
            title="儲存當前槓桿、本金與各級設定至當前組合"
          >
            <Save className="w-3.5 h-3.5 text-indigo-400" />
            <span>{currentSavedId ? '儲存當前組合' : '儲存當前設定'}</span>
          </button>
        </div>

        {/* 側邊欄篩選列 */}
        <div className="px-3 py-2 border-b border-indigo-500/10 bg-[#060a16]/60 grid grid-cols-2 gap-2 text-xs">
          {/* 幣種篩選 */}
          <div className="space-y-1">
            <label className="text-[10px] text-slate-400 font-medium flex items-center gap-1">
              <Filter className="w-3 h-3 text-indigo-400" />
              幣種篩選
            </label>
            <select
              value={filterCurrency}
              onChange={(e) => setFilterCurrency(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-lg px-2 py-1 text-[11px] font-semibold text-slate-200 focus:outline-none"
            >
              <option value="ALL">全部幣種 ({savedStrategies.length})</option>
              {Array.from(new Set(savedStrategies.map(s => s.customCurrencyName))).filter(Boolean).map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          {/* 交易所篩選 */}
          <div className="space-y-1">
            <label className="text-[10px] text-slate-400 font-medium flex items-center gap-1">
              <Filter className="w-3 h-3 text-indigo-400" />
              交易所篩選
            </label>
            <select
              value={filterExchange}
              onChange={(e) => setFilterExchange(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-lg px-2 py-1 text-[11px] font-semibold text-slate-200 focus:outline-none"
            >
              <option value="ALL">全部交易所</option>
              {Array.from(new Set(savedStrategies.map(s => s.exchange))).filter(Boolean).map(ex => (
                <option key={ex} value={ex}>{ex}</option>
              ))}
            </select>
          </div>
        </div>

        {/* 設定列表 */}
        <div className="flex-1 overflow-y-auto p-3 space-y-3 bg-[#060a16]/40">
          {savedStrategies.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-500 space-y-2">
              <FileText className="w-10 h-10 text-slate-700 animate-pulse" />
              <p className="text-xs font-medium">尚無儲存的組合設定</p>
              <p className="text-[10px] text-slate-600 leading-relaxed">
                點擊上方按鈕將目前的槓桿、本金與各級自訂數值儲存起來，便於隨時切換。
              </p>
            </div>
          ) : savedStrategies.filter(strat => {
              if (filterCurrency !== 'ALL' && strat.customCurrencyName !== filterCurrency) return false;
              if (filterExchange !== 'ALL' && strat.exchange !== filterExchange) return false;
              return true;
            }).length === 0 ? (
            <div className="flex flex-col items-center justify-center text-center p-6 text-slate-500 space-y-2">
              <Filter className="w-8 h-8 text-slate-700 animate-pulse" />
              <p className="text-xs font-medium">沒有符合篩選條件的組合</p>
              <button
                onClick={() => { setFilterCurrency('ALL'); setFilterExchange('ALL'); }}
                className="text-[10px] text-indigo-400 hover:text-indigo-300 underline cursor-pointer"
              >
                重置篩選條件
              </button>
            </div>
          ) : (
            savedStrategies.filter(strat => {
              if (filterCurrency !== 'ALL' && strat.customCurrencyName !== filterCurrency) return false;
              if (filterExchange !== 'ALL' && strat.exchange !== filterExchange) return false;
              return true;
            }).map((strat, index) => {
              const isActive = currentSavedId === strat.id;
              const isDragging = draggedIndex === index;
              const isLong = strat.strategyParams.direction === TradeDirection.LONG;
              const dateStr = new Date(strat.timestamp).toLocaleString(undefined, {
                month: 'numeric',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              });

              return (
                <div
                  key={strat.id}
                  onClick={() => {
                    if (currentSavedId === strat.id) return;
                    checkUnsavedBeforeAction(
                      () => handleLoadStrategy(strat),
                      { type: 'LOAD', strategy: strat }
                    );
                  }}
                  draggable={true}
                  onDragStart={(e) => handleDragStart(e, index)}
                  onDragOver={(e) => handleDragOver(e, index)}
                  onDragEnd={handleDragEnd}
                  className={`
                    group relative p-3 rounded-xl border transition-all cursor-pointer flex gap-2 items-start
                    ${isActive 
                      ? 'bg-indigo-950/40 border-indigo-500/60 shadow-lg shadow-indigo-950/20' 
                      : 'bg-[#0d162d] border-slate-800/80 hover:border-slate-700/80 hover:bg-[#111c3a]'
                    }
                    ${isDragging ? 'opacity-40 border-dashed border-indigo-500/80 bg-slate-950' : ''}
                  `}
                >
                  {/* 拖曳握把 */}
                  <div 
                    className="cursor-grab active:cursor-grabbing text-slate-500 hover:text-slate-300 p-0.5 rounded transition-colors shrink-0 mt-0.5"
                    title="拖曳以調整順序"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <GripVertical className="w-3.5 h-3.5" />
                  </div>

                  <div className="flex-1 min-w-0 flex flex-col gap-2.5">
                    {/* 使用中標籤 */}
                    {isActive && (
                      <span className="absolute top-2.5 right-2.5 text-[9px] bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 px-1.5 py-0.5 rounded font-bold">
                        使用中
                      </span>
                    )}

                    {/* 標題與修改 */}
                    <div className="flex items-center justify-between pr-14 min-h-[24px]">
                      <div className="flex items-center gap-1.5 min-w-0 group/title">
                        <div className="font-bold text-xs text-slate-200 line-clamp-1 group-hover:text-white">
                          {strat.name}
                        </div>
                        <button
                          onClick={(e) => handleOpenModifyModal(strat, e)}
                          className="p-0.5 text-slate-500 hover:text-indigo-400 opacity-60 group-hover/title:opacity-100 transition-opacity rounded cursor-pointer shrink-0"
                          title="修改組合參數與名稱"
                        >
                          <Edit2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>

                    {/* 詳細資訊 */}
                    <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-slate-400">
                      <span className="bg-slate-950 px-1.5 py-0.5 rounded font-semibold font-mono text-slate-300">
                        {strat.customCurrencyName}/USDT
                      </span>
                      <span className={`px-1.5 py-0.5 rounded font-bold ${
                        strat.contractType === ContractType.COIN_MARGINED 
                          ? 'bg-purple-950/60 text-purple-300 border border-purple-800/40' 
                          : 'bg-indigo-950/60 text-indigo-300 border border-indigo-800/40'
                      }`}>
                        {strat.contractType === ContractType.COIN_MARGINED ? '幣本位' : 'U本位'}
                      </span>
                      {strat.exchange && (
                        <span className="bg-slate-900 border border-slate-800 px-1.5 py-0.5 rounded font-semibold text-cyan-300">
                          {strat.exchange}
                        </span>
                      )}
                      <span className={`px-1.5 py-0.5 rounded font-bold ${isLong ? 'bg-emerald-950/60 text-emerald-400' : 'bg-rose-950/60 text-rose-400'}`}>
                        {isLong ? '做多' : '做空'}
                      </span>
                      <span className="bg-slate-950 px-1.5 py-0.5 rounded font-mono text-slate-400">
                        {strat.levelsState.length}層
                      </span>
                    </div>

                    {/* 底部時間與更新/覆蓋按鈕 */}
                    <div className="flex items-center justify-between border-t border-slate-800/60 pt-2 mt-1">
                      <span className="text-[9px] text-slate-500 font-mono flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {dateStr}
                      </span>

                      {/* 操作按鈕群組 */}
                      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                        {deleteConfirmId === strat.id ? (
                          <div className="flex items-center gap-1 bg-rose-950/40 border border-rose-900/40 rounded px-1.5 py-0.5">
                            <span className="text-[9px] text-rose-300 font-bold shrink-0">確認刪除？</span>
                            <button
                              onClick={(e) => {
                                handleDeleteStrategy(strat.id, e);
                                setDeleteConfirmId(null);
                              }}
                              className="px-1.5 py-0.5 rounded bg-rose-600 hover:bg-rose-500 text-white font-bold text-[9px] transition-all cursor-pointer"
                            >
                              是
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeleteConfirmId(null);
                              }}
                              className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-[9px] transition-all cursor-pointer"
                            >
                              否
                            </button>
                          </div>
                        ) : overwriteConfirmId === strat.id ? (
                          <div className="flex items-center gap-1 bg-indigo-950/40 border border-indigo-900/40 rounded px-1.5 py-0.5">
                            <span className="text-[9px] text-indigo-300 font-bold shrink-0">確認覆蓋？</span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOverwriteStrategy(strat.id);
                                setOverwriteConfirmId(null);
                              }}
                              className="px-1.5 py-0.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-[9px] transition-all cursor-pointer"
                            >
                              是
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setOverwriteConfirmId(null);
                              }}
                              className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-[9px] transition-all cursor-pointer"
                            >
                              否
                            </button>
                          </div>
                        ) : (
                          <>
                            {/* 修改設定 */}
                            <button
                              onClick={(e) => handleOpenModifyModal(strat, e)}
                              className="p-1 rounded bg-slate-900 hover:bg-indigo-950 border border-slate-800 hover:border-indigo-500/50 text-slate-400 hover:text-indigo-300 transition-all text-[10px] flex items-center gap-1 cursor-pointer"
                              title="修改此組合設定與名稱"
                            >
                              <Edit2 className="w-3 h-3" />
                              修改
                            </button>

                            {/* 覆蓋更新 */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setOverwriteConfirmId(strat.id);
                                setDeleteConfirmId(null);
                              }}
                              className="p-1 rounded bg-slate-900 hover:bg-indigo-600 border border-slate-800 hover:border-indigo-500 text-slate-400 hover:text-white transition-all text-[10px] flex items-center gap-1 cursor-pointer"
                              title="將當前參數覆蓋儲存至此組合"
                            >
                              <Save className="w-3 h-3" />
                              覆蓋
                            </button>

                            {/* 刪除 */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeleteConfirmId(strat.id);
                                setOverwriteConfirmId(null);
                              }}
                              className="p-1 rounded bg-slate-900 hover:bg-rose-950/80 border border-slate-800 hover:border-rose-900 text-slate-400 hover:text-rose-400 transition-all cursor-pointer"
                              title="刪除此設定組合"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* 手機版側邊欄遮罩 */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/60 z-40 md:hidden transition-opacity"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* 主要內容區 */}
      <div className="flex-1 overflow-x-hidden p-4 sm:p-6 flex flex-col min-w-0" id="main-content-container">
      {/* 頂部導航與標題 */}
      <div className="max-w-7xl mx-auto mb-6" id="header-container">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4 glass-card rounded-2xl p-4 sm:p-6 shadow-xl shadow-black/40">
          
          {/* 左側標題 */}
          <div className="flex flex-col xl:flex-row xl:items-center gap-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-indigo-600/15 text-indigo-400 border border-indigo-500/20 rounded-xl glow-border-indigo">
                <Coins className="w-8 h-8 animate-pulse" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-xl sm:text-2xl font-bold tracking-tight gradient-text-primary font-sans" style={{filter: 'drop-shadow(0 0 15px rgba(99,102,241,0.4))'}}>
                    滾倉盈虧計算機
                  </h1>
                  <span className="text-xs bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full border border-slate-700 font-mono">
                    Compound
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-1" style={{textShadow: '0 0 10px rgba(99,102,241,0.15)'}}>
                  加密貨幣趨勢複利與分段加倉模擬系統
                </p>
              </div>
            </div>

            {/* 側邊欄與儲存按鈕 */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                  sidebarOpen 
                    ? 'bg-indigo-600/20 text-indigo-400 border-indigo-500/30' 
                    : 'bg-slate-900 text-slate-300 border-slate-800 hover:text-white hover:border-slate-700'
                }`}
                title="切換儲存設定組合側邊欄"
                id="btn-toggle-sidebar"
              >
                <Bookmark className="w-4 h-4" />
                <span>組合側欄 ({savedStrategies.length})</span>
              </button>

              <button
                onClick={handleQuickSave}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white transition-all shadow-lg shadow-indigo-600/20 cursor-pointer active:scale-[0.98]"
                title="儲存當前滾倉參數組合"
                id="btn-trigger-save-modal"
              >
                <Save className="w-4 h-4" />
                <span>{currentSavedId ? '儲存當前組合' : '儲存當前設定'}</span>
              </button>
            </div>
          </div>

          {/* 中間模式切換與複利模式 */}
            <div className="flex flex-wrap items-center justify-center gap-3 bg-slate-950/40 p-2 rounded-xl border border-indigo-500/10" style={{boxShadow: 'inset 0 0 20px rgba(99,102,241,0.04)'}}>
            {/* 滾倉基礎模式 */}
            <div className="flex bg-slate-950 p-1 rounded-lg border border-slate-800 gap-1">
              <button 
                onClick={() => setRollingMode(RollingMode.DOUBLE)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all duration-200 ${
                  rollingMode === RollingMode.DOUBLE 
                    ? 'bg-indigo-600 text-white shadow' 
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                }`}
                id="btn-mode-double"
              >
                翻倍滾倉
              </button>
              <button 
                onClick={() => setRollingMode(RollingMode.CUSTOM_MULTIPLIER)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all duration-200 ${
                  rollingMode === RollingMode.CUSTOM_MULTIPLIER 
                    ? 'bg-indigo-600 text-white shadow' 
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                }`}
                id="btn-mode-custom"
              >
                自訂倍數滾倉
              </button>
            </div>

            {/* 盈虧複利模式標籤 */}
            <div className="flex bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800 text-xs font-semibold text-emerald-400 bg-emerald-600/10 border-emerald-500/30 items-center gap-1.5" title="每一輪新加倉的本金會自動納入上一輪所累積的盈虧 (複利滾動)">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
              <span>盈虧複利滾倉模式</span>
            </div>
          </div>

          {/* 右側幣種與小數自訂設定 */}
          <div className="flex flex-wrap items-center gap-3">
            {/* 幣種選擇 */}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-slate-400 font-medium">滾倉幣種對</label>
              <div className="flex gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
                <select 
                  value={selectedPreset}
                  onChange={(e) => {
                    const val = e.target.value;
                    setSelectedPreset(val);
                    if (val !== 'CUSTOM') {
                      const crypto = PRESET_CRYPTOS.find(c => c.symbol === val);
                      if (crypto) {
                        setCustomCurrencyName(crypto.symbol);
                        setQtyDecimals(crypto.defaultDecimals);
                        setPriceDecimals(crypto.defaultPriceDecimals ?? 2);
                        
                        setStrategyParams(prev => ({
                          ...prev,
                          initialPrice: crypto.defaultPrice,
                          finalExitPrice: prev.direction === TradeDirection.LONG 
                            ? Math.round(crypto.defaultPrice * 1.15) 
                            : Math.round(crypto.defaultPrice * 0.85)
                        }));
                      }
                    }
                  }}
                  className="bg-transparent text-sm font-semibold text-slate-200 focus:outline-none px-2 py-1 pr-4 cursor-pointer"
                  id="select-preset"
                >
                  {PRESET_CRYPTOS.map(coin => (
                    <option key={coin.symbol} value={coin.symbol} className="bg-[#0f172a] text-slate-200">
                      {coin.symbol} / USDT
                    </option>
                  ))}
                  <option value="CUSTOM" className="bg-[#0f172a] text-slate-200">自訂輸入</option>
                </select>
                {selectedPreset === 'CUSTOM' && (
                  <input 
                    type="text" 
                    value={customCurrencyName}
                    onChange={(e) => setCustomCurrencyName(e.target.value.toUpperCase())}
                    className="bg-slate-900 border-none rounded text-xs font-mono px-2 py-1 text-emerald-400 w-16 focus:ring-1 focus:ring-indigo-500 text-center"
                    placeholder="BTC"
                    id="input-custom-symbol"
                  />
                )}
              </div>
            </div>

            {/* 持倉數量小數位數 */}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-slate-400 font-medium">持倉小數位</label>
              <div className="flex items-center bg-slate-950 px-2 py-1.5 rounded-lg border border-slate-800 gap-1.5" title="調整持倉數量與加倉量的小數位數">
                <input 
                  type="number" 
                  min="0" 
                  max="8" 
                  value={qtyDecimals}
                  onChange={(e) => setQtyDecimals(Math.max(0, parseInt(e.target.value) || 0))}
                  className="bg-transparent border-none text-slate-200 w-8 text-center text-sm font-mono focus:outline-none"
                  id="input-qty-decimals"
                />
                <span className="text-[10px] text-slate-500">位</span>
              </div>
            </div>

            {/* 價格小數位數 */}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-slate-400 font-medium">價格小數位</label>
              <div className="flex items-center bg-slate-950 px-2 py-1.5 rounded-lg border border-slate-800 gap-1.5" title="調整入場價格、計算價格、均價與強平價格的小數位數">
                <input 
                  type="number" 
                  min="0" 
                  max="8" 
                  value={priceDecimals}
                  onChange={(e) => setPriceDecimals(Math.max(0, parseInt(e.target.value) || 0))}
                  className="bg-transparent border-none text-slate-200 w-8 text-center text-sm font-mono focus:outline-none"
                  id="input-price-decimals"
                />
                <span className="text-[10px] text-slate-500">位</span>
              </div>
            </div>

            {/* 累計漲跌幅 */}
            <div className="bg-[#1e1420]/80 border border-rose-900/40 rounded-xl px-4 py-2 text-right shadow-inner glow-border-rose animate-pulse-glow">
              <div className="text-[10px] text-rose-400 font-medium">策略總回報 (ROI)</div>
              <div className={`text-lg font-bold font-mono ${totalNetProfit >= 0 ? 'text-emerald-400' : 'text-rose-500'}`} id="roi-value">
                {totalNetProfit >= 0 ? '+' : ''}{roundTo(finalReturnPercent, 2)}%
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* 策略與監控分欄 */}
      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6 mb-6" id="strategy-grid">
        
        {/* 左側：策略參數設定 */}
        <div className="lg:col-span-7 glass-card rounded-2xl p-6 shadow-xl" id="strategy-settings-panel">
          <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-4">
            <div className="flex items-center gap-2">
              <Sliders className="w-5 h-5 text-indigo-400" />
              <h2 className="text-base font-bold text-white" style={{textShadow: '0 0 8px rgba(99,102,241,0.3)'}}>策略參數設定</h2>
            </div>
            
            {/* 交易方向 */}
            <div className="flex bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs font-bold">
              <button 
                onClick={() => handleDirectionToggle(TradeDirection.LONG)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded transition-all duration-200 ${
                  strategyParams.direction === TradeDirection.LONG 
                    ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-900/30' 
                    : 'text-slate-400 hover:text-emerald-400'
                }`}
                id="btn-direction-long"
              >
                <TrendingUp className="w-3.5 h-3.5" />
                做多 LONG
              </button>
              <button 
                onClick={() => handleDirectionToggle(TradeDirection.SHORT)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded transition-all duration-200 ${
                  strategyParams.direction === TradeDirection.SHORT 
                    ? 'bg-rose-600 text-white shadow-lg shadow-rose-900/30' 
                    : 'text-slate-400 hover:text-rose-400'
                }`}
                id="btn-direction-short"
              >
                <TrendingDown className="w-3.5 h-3.5" />
                做空 SHORT
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* 初始本金 */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs text-slate-300 font-medium flex items-center gap-1">
                  初始本金 (USDT)
                  <span className="text-slate-500 hover:text-indigo-400 cursor-help" title="起始運作此滾倉策略的總準備資金">
                    <HelpCircle className="w-3 h-3" />
                  </span>
                </label>
              </div>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-slate-500 text-sm">$</span>
                <input 
                  type="number" 
                  value={strategyParams.initialCapital} 
                  onChange={(e) => setStrategyParams(p => ({ ...p, initialCapital: Math.max(0, parseFloat(e.target.value) || 0) }))}
                  className="w-full bg-slate-950/80 border border-slate-800 rounded-lg pl-7 pr-3 py-2 text-sm text-slate-100 font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  placeholder="650"
                  id="input-initial-capital"
                />
              </div>
            </div>

            {/* 開場價格 */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs text-slate-300 font-medium flex items-center gap-1">
                  開場價格 (ENTRY)
                  <span className="text-slate-500 hover:text-indigo-400 cursor-help" title="第 1 級別起始開倉的市場價格">
                    <HelpCircle className="w-3 h-3" />
                  </span>
                </label>
                <span className="text-[10px] text-indigo-400 font-mono">1 {customCurrencyName}</span>
              </div>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-slate-500 text-sm">USDT</span>
                <input 
                  type="number" 
                  value={strategyParams.initialPrice} 
                  onChange={(e) => setStrategyParams(p => ({ ...p, initialPrice: Math.max(0, parseFloat(e.target.value) || 0) }))}
                  className="w-full bg-slate-950/80 border border-slate-800 rounded-lg pl-12 pr-3 py-2 text-sm text-slate-100 font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  placeholder="59191"
                  id="input-initial-price"
                />
              </div>
            </div>

            {/* 初始槓桿 */}
            <div className="space-y-1.5">
              <label className="text-xs text-slate-300 font-medium">
                初始槓桿 (L)
              </label>
              <div className="relative">
                <input 
                  type="number" 
                  value={strategyParams.initialLeverage} 
                  onChange={(e) => setStrategyParams(p => ({ ...p, initialLeverage: Math.max(1, parseFloat(e.target.value) || 1) }))}
                  className="w-full bg-slate-950/80 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  placeholder="10"
                  id="input-initial-leverage"
                />
                <span className="absolute right-3 top-2.5 text-slate-500 text-xs">x</span>
              </div>
            </div>

            {/* 加倉幅度 */}
            {rollingMode !== RollingMode.DOUBLE && (
              <div className="space-y-1.5 animate-fade-in">
                <label className="text-xs text-slate-300 font-medium flex items-center gap-1">
                  加倉幅度 (%)
                  <span className="text-slate-500 hover:text-indigo-400 cursor-help" title="每一輪滾倉加倉的價格變化間距比率">
                    <HelpCircle className="w-3 h-3" />
                  </span>
                </label>
                <div className="relative">
                  <input 
                    type="number" 
                    step="0.1"
                    value={strategyParams.addPositionInterval} 
                    onChange={(e) => setStrategyParams(p => ({ ...p, addPositionInterval: Math.max(0, parseFloat(e.target.value) || 0) }))}
                    className="w-full bg-slate-950/80 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    placeholder="3"
                    id="input-add-position-interval"
                  />
                  <span className="absolute right-3 top-2.5 text-slate-500 text-xs">%</span>
                </div>
              </div>
            )}

            {/* 手續費 */}
            <div className="space-y-1.5">
              <label className="text-xs text-slate-300 font-medium">
                單邊開倉手續費 (%)
              </label>
              <div className="relative">
                <input 
                  type="number" 
                  step="0.01"
                  value={strategyParams.feeRate} 
                  onChange={(e) => setStrategyParams(p => ({ ...p, feeRate: Math.max(0, parseFloat(e.target.value) || 0) }))}
                  className="w-full bg-slate-950/80 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  placeholder="0.02"
                  id="input-fee-rate"
                />
                <span className="absolute right-3 top-2.5 text-slate-500 text-xs">%</span>
              </div>
            </div>

            {/* 最終出場目標價 */}
            <div className="space-y-1.5">
              <label className="text-xs text-slate-300 font-medium">
                最終出場目標價 (USDT)
              </label>
              <div className="relative">
                <input 
                  type="number" 
                  value={strategyParams.finalExitPrice || ''} 
                  onChange={(e) => setStrategyParams(p => ({ ...p, finalExitPrice: Math.max(0, parseFloat(e.target.value) || 0) }))}
                  className="w-full bg-slate-950/80 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500 text-slate-200"
                  placeholder={lastLevel ? `自動: ${lastLevel.calcPrice}` : "50000"}
                  id="input-final-exit-price"
                />
                <span className="absolute right-3 top-2.5 text-slate-500 text-xs">USDT</span>
              </div>
            </div>

            {/* 手續費與淨利潤計算選項卡 */}
            <div className="space-y-3 sm:col-span-2 bg-slate-950/60 p-3.5 rounded-xl border border-slate-800/80">
              <div className="text-xs font-bold text-slate-200 flex items-center justify-between border-b border-slate-800/80 pb-2">
                <span>手續費與淨利潤計算模式</span>
                <span className="text-[10px] text-indigo-400 font-mono">Fee & Profit Rules</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* 選取框 1：淨利潤包含/扣除手續費 */}
                <label className="flex items-start gap-2.5 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={strategyParams.deductFeeFromNetProfit ?? true}
                    onChange={(e) => setStrategyParams(p => ({ ...p, deductFeeFromNetProfit: e.target.checked }))}
                    className="mt-0.5 w-4 h-4 rounded border-slate-700 bg-slate-900 text-indigo-600 focus:ring-indigo-500 cursor-pointer accent-indigo-500"
                  />
                  <div className="text-xs">
                    <span className="font-bold text-slate-200 group-hover:text-white transition-colors">
                      淨利潤顯示扣除手續費
                    </span>
                    <p className="text-[10px] text-slate-400 mt-0.5 leading-normal">
                      {strategyParams.deductFeeFromNetProfit ?? true
                        ? "【已開啟】淨利潤數值已扣除累積開倉手續費"
                        : "【未開啟】淨利潤顯示毛利潤 (未扣手續費)"}
                    </p>
                  </div>
                </label>

                {/* 選取框 2：加倉數量計算先扣除手續費 */}
                <label className="flex items-start gap-2.5 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={strategyParams.deductFeeFromPositionSizing ?? false}
                    onChange={(e) => setStrategyParams(p => ({ ...p, deductFeeFromPositionSizing: e.target.checked }))}
                    className="mt-0.5 w-4 h-4 rounded border-slate-700 bg-slate-900 text-indigo-600 focus:ring-indigo-500 cursor-pointer accent-indigo-500"
                  />
                  <div className="text-xs">
                    <span className="font-bold text-slate-200 group-hover:text-white transition-colors">
                      加倉本金先扣除手續費
                    </span>
                    <p className="text-[10px] text-slate-400 mt-0.5 leading-normal">
                      {strategyParams.deductFeeFromPositionSizing ?? false
                        ? "【已開啟】每輪滾倉加倉前，先扣除手續費再算加倉量"
                        : "【預設】複利滾倉加倉時，依前輪全額權益直接計算"}
                    </p>
                  </div>
                </label>
              </div>
            </div>

            {/* 進階：維持保證金率 */}
            <div className="space-y-1.5 sm:col-span-2 pt-2">
              <details className="text-xs text-slate-400 cursor-pointer">
                <summary className="hover:text-indigo-400 transition-colors font-medium select-none">
                  進階強平參數設定 (維持保證金比率)
                </summary>
                <div className="bg-slate-950/40 p-3 rounded-lg border border-slate-800/80 mt-2 space-y-2">
                  <div className="flex items-center justify-between">
                    <span>維持保證金比率 (MM %)</span>
                    <input 
                      type="number" 
                      step="0.05"
                      value={strategyParams.maintenanceMargin}
                      onChange={(e) => setStrategyParams(p => ({ ...p, maintenanceMargin: Math.max(0, parseFloat(e.target.value) || 0) }))}
                      className="bg-slate-900 border border-slate-700 rounded px-2 py-1 w-16 text-right text-xs font-mono focus:outline-none"
                    />
                  </div>
                  <p className="text-[10px] text-slate-500">
                    預設 0.5%。當虧損使可用保證金低於維持比率時觸發系統強制平倉。
                  </p>
                </div>
              </details>
            </div>

          </div>
        </div>

        {/* 右側：動態風險監控 */}
        <div className="lg:col-span-5 glass-card rounded-2xl p-6 shadow-xl flex flex-col justify-between" id="risk-panel">
          <div>
            <div className="flex items-center gap-2 border-b border-slate-800 pb-4 mb-4">
              <ShieldAlert className="w-5 h-5 text-indigo-400" />
              <h2 className="text-base font-bold text-white" style={{textShadow: '0 0 8px rgba(99,102,241,0.3)'}}>動態風險監控</h2>
            </div>

            {/* 理論強平價格估算 */}
            <div className="bg-[#0a0f1e]/80 border border-rose-500/15 rounded-xl p-4 mb-4 shadow-inner text-center glow-border-rose">
              <div className="text-xs text-slate-400 font-medium flex items-center justify-center gap-1">
                理論強平價格估算 (當前級別)
                <span className="text-slate-500 hover:text-indigo-400 cursor-help" title="依據當前累積持倉、均價與總投入本金，所推估出的極限爆倉價格">
                  <HelpCircle className="w-3.5 h-3.5" />
                </span>
              </div>
              
              <div className="text-2xl sm:text-3xl font-extrabold font-mono text-rose-500 tracking-wide mt-2" style={{textShadow: '0 0 20px rgba(244,63,94,0.4), 0 0 40px rgba(244,63,94,0.15)'}}>
                {lastLevel ? lastLevel.liquidationPrice.toLocaleString(undefined, { minimumFractionDigits: priceDecimals, maximumFractionDigits: priceDecimals }) : '0.00'}
                <span className="text-xs font-medium text-slate-400 ml-1">USDT</span>
              </div>

              {lastLevel && (
                <div className="text-xs text-slate-400 mt-2 flex items-center justify-center gap-1.5">
                  <span>當前距離：</span>
                  <span className={`font-mono font-bold px-2 py-0.5 rounded ${
                    lastLevel.distanceToLiqPercent > 10 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'
                  }`}>
                    {lastLevel.distanceToLiqPercent}%
                  </span>
                </div>
              )}
            </div>

            {/* 資金槓桿動態 bar */}
            <div className="space-y-3 mb-4">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-300 font-medium">實際有效槓桿 (Effective Leverage)</span>
                <span className="font-mono text-indigo-400 font-bold">{roundTo(effectiveLeverage, 2)}x</span>
              </div>
              
              {/* Progress bar visual */}
              <div className="w-full bg-slate-950 h-3 rounded-full border border-slate-800 overflow-hidden relative">
                <div 
                  className={`h-full rounded-full transition-all duration-300 ${
                    effectiveLeverage > 50 
                      ? 'bg-rose-600' 
                      : effectiveLeverage > 20 
                        ? 'bg-amber-500' 
                        : 'bg-emerald-500'
                  }`}
                  style={{ width: `${Math.min(100, (effectiveLeverage / 100) * 100)}%` }}
                />
              </div>

              <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                <span>x1 (安全)</span>
                <span>x20 (中風險)</span>
                <span>x50+ (極高風險)</span>
              </div>
            </div>

            {/* 目標與無複利（不滾倉）對比 */}
            <div className="bg-[#0a0f1e]/80 border border-indigo-500/15 rounded-xl p-4 mt-2 mb-4 space-y-3 glow-border-indigo" id="no-compound-compare-card">
              <div className="text-xs font-bold text-slate-300 flex items-center gap-1.5 border-b border-slate-800/60 pb-2">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 inline-block"></span>
                目標價格與單筆持倉（不滾倉）對比
              </div>
              
              <div className="grid grid-cols-2 gap-3">
                {/* 價格距離 */}
                <div className="bg-slate-950/60 p-2.5 rounded-lg border border-slate-900">
                  <span className="text-[10px] text-slate-500 block">入場至目標價格</span>
                  <span className={`text-sm font-bold font-mono ${priceDistancePercent >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {priceDistancePercent >= 0 ? '▲ 漲幅' : '▼ 跌幅'} {Math.abs(roundTo(priceDistancePercent, 2))}%
                  </span>
                  <span className="text-[9px] text-slate-500 block mt-0.5 font-mono">
                    {entryP.toLocaleString()} → {exitP.toLocaleString()}
                  </span>
                </div>

                {/* 無複利回報倍數 */}
                <div className="bg-slate-950/60 p-2.5 rounded-lg border border-slate-900">
                  <span className="text-[10px] text-slate-500 block">不滾倉回報倍數</span>
                  <span className={`text-sm font-bold font-mono ${noRollingROI >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {roundTo(noRollingMultiple, 2)}x
                  </span>
                  <span className="text-[9px] text-slate-500 block mt-0.5 font-mono">
                    ROI: {noRollingROI >= 0 ? '+' : ''}{roundTo(noRollingROI, 1)}%
                  </span>
                </div>
              </div>

              {/* 對比效益 */}
              <div className="text-[10px] text-slate-400 leading-relaxed bg-slate-950/40 p-2 rounded border border-slate-800/40 font-sans">
                <span className="text-indigo-400 font-bold">複利對比效益：</span>
                {finalReturnPercent > noRollingROI ? (
                  <span>
                    滾倉策略可賺 <strong className="text-emerald-400 font-bold font-mono">{roundTo(finalReturnPercent, 1)}%</strong>，比不滾倉多賺 <strong className="text-emerald-400 font-bold font-mono">{roundTo((finalReturnPercent - noRollingROI), 1)}%</strong> 淨收益！
                  </span>
                ) : (
                  <span>
                    此配置下目前無額外超額收益，請嘗試增加滾倉級別或調整加倉間距。
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* 理論說明小卡 */}
          <div className="bg-[#060a16]/80 border border-indigo-500/10 rounded-xl p-3 text-xs text-slate-400 mt-2">
            <div className="flex gap-2">
              <Info className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-bold text-slate-300">滾倉核心法規：</p>
                <p>
                  1. <strong className="text-slate-200">趨勢追加</strong>：在價格朝有利方向移動時追加倉位，放大盈利潛力。
                </p>
                <p>
                  2. <strong className="text-slate-200">強平防線</strong>：透過分段拉開均價，讓強平價格始終保持在安全的趨勢回撤範圍之外。
                </p>
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* 滾倉級別表格 */}
      <div className="max-w-7xl mx-auto mb-6" id="table-container">
        <div className="glass-card rounded-2xl overflow-hidden shadow-xl">
          
          <div className="p-4 sm:p-6 border-b border-indigo-500/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900/10 shimmer-line">
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <span className="w-2.5 h-2.5 bg-indigo-500 rounded-full animate-ping" style={{boxShadow: '0 0 8px rgba(99,102,241,0.6)'}}></span>
                分段滾倉級別模擬表
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                您可以自由修改每一輪的入場價格、槓桿，甚至是該輪分配的本金！
              </p>
            </div>

            <div className="text-xs text-slate-400 flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-amber-500/20 border border-amber-500/40 inline-block"></span>
              <span>黃色外框欄位可手動輸入調整</span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse" id="rolling-table">
              <thead>
                <tr className="bg-slate-950/60 border-b border-slate-800 text-slate-400 text-xs font-semibold">
                  <th className="py-4 px-3 text-center w-16">級別</th>
                  <th className="py-4 px-3">入場價格 (USDT)</th>
                  <th className="py-4 px-3">累積均價</th>
                  <th className="py-4 px-3">估算強平</th>
                  <th className="py-4 px-3">計算價格 (USDT)</th>
                  <th className="py-4 px-3 text-center">漲跌 %</th>
                  <th className="py-4 px-3 text-center w-20">槓桿倍數</th>
                  <th className="py-4 px-3 w-28">本輪本金 (U)</th>
                  <th className="py-4 px-3 text-right">本輪加倉</th>
                  <th className="py-4 px-3 text-right">累積持倉</th>
                  <th className="py-4 px-3 text-right pr-6">
                    累積淨利潤
                    <span className={`text-[9px] font-normal block ${
                      strategyParams.deductFeeFromNetProfit ?? true ? 'text-emerald-400' : 'text-amber-400'
                    }`}>
                      {strategyParams.deductFeeFromNetProfit ?? true ? '(已扣手續費)' : '(毛利潤/未扣)'}
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-sm font-mono">
                <AnimatePresence initial={false}>
                  {computedLevels.map((level, idx) => {
                    const isFirst = idx === 0;
                    const rawLevelState = levelsState[idx] || {};
                    const isCurrentActive = activeLevelIndex === idx;
                    const isCompleted = activeLevelIndex !== null && idx < activeLevelIndex;

                    // Display values: if custom, use the overridden value from levelsState; otherwise use the calculated value from level
                    const displayEntryPrice = rawLevelState.isCustomEntryPrice ? (rawLevelState.entryPrice ?? '') : level.entryPrice;
                    const displayCalcPrice = rawLevelState.isCustomCalcPrice ? (rawLevelState.calcPrice ?? '') : level.calcPrice;
                    const displayLeverage = rawLevelState.isCustomLeverage ? (rawLevelState.leverage ?? '') : level.leverage;
                    const displayCapital = rawLevelState.isCustomCapital ? (rawLevelState.capital ?? '') : level.capital;
                    const displayThisRoundSize = rawLevelState.isCustomThisRoundPositionSize ? (rawLevelState.thisRoundPositionSize ?? '') : level.thisRoundPositionSize;

                    return (
                      <motion.tr 
                        key={level.id}
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        onClick={() => handleToggleActiveLevel(idx)}
                        className={`transition-all duration-200 cursor-pointer ${
                          isCurrentActive 
                            ? 'row-active-neon text-white font-bold' 
                            : isCompleted
                              ? 'bg-emerald-950/20 border-l-2 border-l-emerald-500/50 text-slate-300 hover:bg-emerald-950/30'
                              : 'hover:bg-slate-900/40 text-slate-300'
                        }`}
                      >
                        {/* 級別 & 進度標記 */}
                        <td className="py-3 px-3 text-center" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-center gap-1">
                            {!isFirst ? (
                              <button 
                                onClick={() => handleRemoveLevel(level.id, idx)}
                                className="text-slate-500 hover:text-rose-400 transition-colors cursor-pointer mr-0.5"
                                title="刪除此滾倉級別"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            ) : null}

                            <button
                              onClick={() => handleToggleActiveLevel(idx)}
                              className={`px-2.5 py-1 rounded-lg text-xs font-bold font-mono transition-all flex items-center gap-1 cursor-pointer select-none ${
                                isCurrentActive
                                  ? 'bg-gradient-to-r from-cyan-400 to-indigo-500 text-slate-950 shadow-lg shadow-cyan-500/40 ring-2 ring-cyan-300 font-extrabold scale-105 animate-pulse'
                                  : isCompleted
                                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                                    : 'bg-slate-900 text-slate-400 border border-slate-800 hover:border-indigo-500/50 hover:text-indigo-300'
                              }`}
                              title={isCurrentActive ? "取消當前滾倉層級標記" : "點擊設為當前滾倉進行中層級"}
                            >
                              {isCurrentActive ? <Flag className="w-3.5 h-3.5 text-slate-950 fill-slate-950 animate-bounce" /> : null}
                              <span>L{level.level}</span>
                            </button>
                          </div>
                        </td>

                        {/* 入場價格 (Editable) */}
                        <td className="py-3 px-3">
                          <div className="flex items-center gap-1.5">
                            <div className="relative">
                              <input 
                                type="number"
                                value={displayEntryPrice}
                                onChange={(e) => handleUpdateLevel(idx, 'entryPrice', e.target.value)}
                                className={`bg-slate-950 border rounded px-2 py-1 text-xs w-28 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono transition-colors duration-200 ${
                                  level.isCustomEntryPrice 
                                    ? 'border-amber-500/80 bg-amber-500/10 text-amber-300 font-bold shadow-lg shadow-amber-500/10' 
                                    : 'border-slate-800 text-slate-300 hover:border-slate-700'
                                }`}
                                placeholder="價格"
                              />
                            </div>
                            {level.isCustomEntryPrice && (
                              <button 
                                onClick={() => handleResetLevelField(idx, 'entryPrice')}
                                className="text-amber-500 hover:text-amber-400 p-1 rounded hover:bg-slate-800 transition-colors cursor-pointer"
                                title="重置為自動計算價格"
                              >
                                <RotateCcw className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>

                        {/* 均價 */}
                        <td className="py-4 px-4 text-cyan-400 font-bold">
                          ${level.averagePrice.toLocaleString(undefined, { minimumFractionDigits: priceDecimals, maximumFractionDigits: priceDecimals })}
                        </td>

                        {/* 估算強平 */}
                        <td className="py-4 px-4">
                          <div className="flex flex-col">
                            <span className="text-rose-400 font-bold">
                              ${level.liquidationPrice.toLocaleString(undefined, { minimumFractionDigits: priceDecimals, maximumFractionDigits: priceDecimals })}
                            </span>
                            <span className="text-[10px] text-rose-500">
                              距: {level.distanceToLiqPercent}%
                            </span>
                          </div>
                        </td>

                        {/* 計算價格 (Editable) */}
                        <td className="py-3 px-3">
                          <div className="flex items-center gap-1.5">
                            <input 
                              type="number"
                              value={displayCalcPrice}
                              onChange={(e) => handleUpdateLevel(idx, 'calcPrice', e.target.value)}
                              className={`bg-slate-950 border rounded px-2 py-1 text-xs w-28 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono transition-colors duration-200 ${
                                level.isCustomCalcPrice 
                                  ? 'border-amber-500/80 bg-amber-500/10 text-amber-300 font-bold shadow-lg shadow-amber-500/10' 
                                  : 'border-slate-800 text-slate-300 hover:border-slate-700'
                              }`}
                              placeholder="平倉計算價"
                            />
                            {level.isCustomCalcPrice && (
                              <button 
                                onClick={() => handleResetLevelField(idx, 'calcPrice')}
                                className="text-amber-500 hover:text-amber-400 p-1 rounded hover:bg-slate-800 transition-colors cursor-pointer"
                                title="重置為策略預設目標價"
                              >
                                <RotateCcw className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>

                        {/* 漲跌 % */}
                        <td className="py-4 px-4 text-center">
                          <span className={`text-xs px-2 py-0.5 rounded font-bold ${
                            level.priceChangePercent >= 0 
                              ? 'bg-emerald-500/10 text-emerald-400' 
                              : 'bg-rose-500/10 text-rose-400'
                          }`}>
                            {level.priceChangePercent >= 0 ? '+' : ''}{level.priceChangePercent}%
                          </span>
                        </td>

                        {/* 槓桿倍數 (Editable or Derived) */}
                        <td className="py-3 px-3 text-center">
                          <div className="inline-flex items-center gap-1.5">
                            <input 
                              type="number"
                              min="0.01"
                              step="0.01"
                              value={level.isDerivedLeverageFromPositionSize ? level.leverage : displayLeverage}
                              onChange={(e) => handleUpdateLevel(idx, 'leverage', e.target.value)}
                              className={`bg-slate-950 border rounded px-2 py-1 text-xs text-center w-20 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono transition-colors duration-200 ${
                                level.isDerivedLeverageFromPositionSize
                                  ? 'border-amber-500/60 bg-amber-500/10 text-amber-300 font-bold'
                                  : level.isCustomLeverage 
                                    ? 'border-amber-500/80 bg-amber-500/10 text-amber-300 font-bold shadow-lg shadow-amber-500/10' 
                                    : 'border-slate-800 text-slate-300 hover:border-slate-700'
                              }`}
                              placeholder="槓桿"
                              title={level.isDerivedLeverageFromPositionSize ? `根據本輪加倉量 (${level.thisRoundPositionSize}) 自動反推之槓桿: ${level.leverage}x` : "槓桿倍數"}
                            />
                            <span className="text-slate-500 text-xs">x</span>
                            {level.isDerivedLeverageFromPositionSize && (
                              <span className="text-[9px] bg-amber-500/20 text-amber-300 border border-amber-500/40 px-1 py-0.2 rounded font-bold shrink-0" title="由加倉數量反推槓桿">
                                反推
                              </span>
                            )}
                            {level.isCustomLeverage && !level.isDerivedLeverageFromPositionSize && (
                              <button 
                                onClick={() => handleResetLevelField(idx, 'leverage')}
                                className="text-amber-500 hover:text-amber-400 p-1 rounded hover:bg-slate-800 transition-colors cursor-pointer"
                                title="重置為自動計算槓桿"
                              >
                                <RotateCcw className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>

                        {/* 本輪本金 (Editable & Auto indicator) */}
                        <td className="py-3 px-3">
                          <div className="flex items-center gap-1.5">
                            <input 
                              type="number"
                              value={displayCapital}
                              onChange={(e) => handleUpdateLevel(idx, 'capital', e.target.value)}
                              className={`bg-slate-950 border rounded px-2 py-1 text-xs text-right w-24 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono transition-colors duration-200 ${
                                level.isCustomCapital 
                                  ? 'border-amber-500 bg-amber-500/10 text-amber-300 font-bold shadow-lg shadow-amber-500/10' 
                                  : 'border-slate-800 text-slate-300 hover:border-slate-700'
                              }`}
                              placeholder="本金"
                            />
                            {level.isCustomCapital && (
                              <button 
                                onClick={() => handleResetLevelField(idx, 'capital')}
                                className="text-amber-500 hover:text-amber-400 p-1 rounded hover:bg-slate-800 transition-colors cursor-pointer"
                                title="還原至自動滾倉本金"
                              >
                                <RotateCcw className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>

                        {/* 本輪加倉 (Editable - 輸入加倉量可反推槓桿) */}
                        <td className="py-3 px-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <div className="relative">
                              <input 
                                type="number"
                                step={Math.pow(10, -qtyDecimals).toString()}
                                value={displayThisRoundSize}
                                onChange={(e) => handleUpdateLevel(idx, 'thisRoundPositionSize', e.target.value)}
                                className={`bg-slate-950 border rounded px-2 py-1 text-xs text-right w-24 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono transition-colors duration-200 ${
                                  level.isCustomThisRoundPositionSize 
                                    ? 'border-amber-500/80 bg-amber-500/10 text-amber-300 font-bold shadow-lg shadow-amber-500/10' 
                                    : 'border-slate-800 text-emerald-400 font-medium hover:border-slate-700'
                                }`}
                                placeholder="加倉量"
                              />
                            </div>
                            {level.isCustomThisRoundPositionSize && (
                              <button 
                                onClick={() => handleResetLevelField(idx, 'thisRoundPositionSize')}
                                className="text-amber-500 hover:text-amber-400 p-1 rounded hover:bg-slate-800 transition-colors cursor-pointer"
                                title="重置為由槓桿自動計算之加倉數量"
                              >
                                <RotateCcw className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>

                        {/* 累積持倉 */}
                        <td className="py-4 px-4 text-right text-slate-300 font-semibold">
                          {level.cumulativePositionSize} <span className="text-xs text-slate-500 font-sans">{customCurrencyName}</span>
                        </td>

                        {/* 累積淨利潤 */}
                        <td className={`py-4 px-4 text-right font-extrabold pr-6 ${
                          level.netProfit >= 0 ? 'text-emerald-400' : 'text-rose-500'
                        }`}>
                          {level.netProfit >= 0 ? '+' : ''}${level.netProfit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                      </motion.tr>
                    );
                  })}
                </AnimatePresence>
              </tbody>
            </table>
          </div>

          {/* 增加一輪滾倉級別按鈕 */}
          <div className="p-4 border-t border-slate-800 text-center bg-slate-900/10">
            <button 
              onClick={handleAddLevel}
              className="inline-flex items-center gap-2 px-6 py-3 border border-dashed border-indigo-500/50 hover:border-indigo-400 text-indigo-400 hover:text-indigo-300 rounded-xl transition-all duration-200 text-sm font-semibold cursor-pointer"
              id="btn-add-level"
            >
              <Plus className="w-4 h-4" />
              增加一輪滾倉級別 ADD NEXT LEVEL
            </button>
          </div>

        </div>
      </div>

      {/* 總結底欄 & 淨利潤看板 */}
      <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-12 gap-6" id="summary-section">
        
        {/* 預估總淨利潤高亮展示 */}
        <div className="md:col-span-8 glass-card rounded-2xl p-6 shadow-xl flex flex-col justify-between" id="profit-highlight-card">
          <div className="flex justify-between items-start">
            <div>
              <span className="text-xs text-slate-400 font-bold uppercase tracking-wider">
                當前最終期望淨利潤 ESTIMATED NET PROFIT
              </span>
              <p className="text-xs text-slate-500 mt-1">
                以最後一級別之計算價格與手續費折算後之純利潤
              </p>
            </div>
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-2.5 py-1 text-xs text-emerald-400 font-bold">
              ROI: {roundTo(finalReturnPercent, 1)}%
            </div>
          </div>

          <div className="my-6">
            <span className={`text-4xl sm:text-5xl font-black font-mono tracking-tight ${
              totalNetProfit >= 0 ? 'text-emerald-400' : 'text-rose-500'
            }`} style={{textShadow: totalNetProfit >= 0 ? '0 0 25px rgba(16,185,129,0.4), 0 0 50px rgba(16,185,129,0.15)' : '0 0 25px rgba(239,68,68,0.4), 0 0 50px rgba(239,68,68,0.15)'}} id="total-profit-display">
              {totalNetProfit >= 0 ? '+' : ''}{totalNetProfit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT
            </span>
          </div>

          <div className="flex flex-wrap gap-4 text-xs text-slate-400 border-t border-slate-800/80 pt-4 font-mono">
            <div>
              最終回報倍數: <strong className="text-white font-bold">{roundTo(finalReturnMultiple, 2)}x</strong>
            </div>
            <div className="text-slate-600">|</div>
            <div>
              分段滾倉級數: <strong className="text-white font-bold">{levelsState.length} LEVELS</strong>
            </div>
            <div className="text-slate-600">|</div>
            <div>
              累計手續費: <strong className="text-rose-400 font-bold">${roundTo(totalFees, 2)} U</strong>
            </div>
          </div>
        </div>

        {/* 輔助總結與重置 Bento 卡 */}
        <div className="md:col-span-4 grid grid-cols-2 gap-4" id="summary-bento-cards">
          
          <div className="bg-[#060a16]/80 border border-indigo-500/10 rounded-xl p-4 flex flex-col justify-between hover-float">
            <span className="text-[10px] text-slate-400 font-medium">初始本金</span>
            <div>
              <div className="text-lg font-bold font-mono text-white">${strategyParams.initialCapital}</div>
              <span className="text-[10px] text-slate-500">USDT Collateral</span>
            </div>
          </div>

          <div className="bg-[#060a16]/80 border border-indigo-500/10 rounded-xl p-4 flex flex-col justify-between hover-float">
            <span className="text-[10px] text-slate-400 font-medium">持倉最終面值</span>
            <div>
              <div className="text-lg font-bold font-mono text-indigo-400">
                ${lastLevel ? roundTo(lastLevel.cumulativePositionSize * (lastLevel.entryPrice || 1), 2).toLocaleString() : '0'}
              </div>
              <span className="text-[10px] text-slate-500">USDT Exposure</span>
            </div>
          </div>

          <div className="bg-[#060a16]/80 border border-indigo-500/10 rounded-xl p-4 flex flex-col justify-between hover-float">
            <span className="text-[10px] text-slate-400 font-medium">持倉最終數量</span>
            <div>
              <div className="text-sm font-bold font-mono text-emerald-400">
                {lastLevel ? lastLevel.cumulativePositionSize : '0'} {customCurrencyName}
              </div>
              <span className="text-[10px] text-slate-500">Asset Size</span>
            </div>
          </div>

          <div className="bg-[#060a16]/80 border border-indigo-500/10 rounded-xl p-4 flex flex-col justify-between hover-float">
            <span className="text-[10px] text-slate-400 font-medium">出場目標價</span>
            <div>
              <div className="text-lg font-bold font-mono text-amber-400">${strategyParams.finalExitPrice}</div>
              <span className="text-[10px] text-slate-500">USDT Target</span>
            </div>
          </div>

          <div className="bg-[#060a16]/80 border border-indigo-500/10 rounded-xl p-4 flex flex-col justify-between hover-float">
            <span className="text-[10px] text-slate-400 font-medium">目標價距漲跌幅</span>
            <div>
              <div className={`text-lg font-bold font-mono ${priceDistancePercent >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {priceDistancePercent >= 0 ? '+' : ''}{roundTo(priceDistancePercent, 2)}%
              </div>
              <span className="text-[10px] text-slate-500">Distance from Entry</span>
            </div>
          </div>

          <div className="bg-[#060a16]/80 border border-indigo-500/10 rounded-xl p-4 flex flex-col justify-between hover-float">
            <span className="text-[10px] text-slate-400 font-medium">不滾倉回報倍數</span>
            <div>
              <div className={`text-lg font-bold font-mono ${noRollingROI >= 0 ? 'text-emerald-400' : 'text-rose-500'}`}>
                {roundTo(noRollingMultiple, 2)}x
              </div>
              <span className="text-[10px] text-slate-500">Simple ROI: {noRollingROI >= 0 ? '+' : ''}{roundTo(noRollingROI, 1)}%</span>
            </div>
          </div>

          <button 
            onClick={handleReset}
            className="col-span-2 bg-[#060a16]/80 hover:bg-[#0a0f1e] border border-indigo-500/10 hover:border-indigo-500/30 rounded-xl p-4 flex items-center justify-center gap-2 text-xs font-bold text-slate-300 hover:text-white transition-all cursor-pointer group"
            id="btn-reset-strategy"
          >
            <RotateCcw className="w-4 h-4 animate-spin-slow" />
            數據重置 RESET
          </button>

        </div>

      </div>

      {/* 頁腳 */}
      <div className="max-w-7xl mx-auto mt-12 text-center text-slate-600 text-xs border-t border-slate-900 pt-6" id="footer-copyright">
        加密貨幣滾倉計算機 © 2026 • 專業金融工具與走勢複利模擬系統
      </div>
    </div> {/* Close main-content-container */}

    {/* 儲存/修改設定組合彈出視窗 */}
    <AnimatePresence>
      {isSaveModalOpen && (
        <div className="fixed inset-0 top-0 left-0 w-screen h-screen z-[100] flex items-center justify-center p-4" id="save-preset-modal-overlay">
          {/* Modal Backdrop overlay */}
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/75 backdrop-blur-sm"
            onClick={handleCloseSaveModal}
          />

          {/* Modal content box */}
          <motion.div 
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ type: "spring", duration: 0.3 }}
            className="glass-card rounded-2xl p-6 w-full max-w-md shadow-2xl relative z-10 my-auto"
            id="save-preset-modal-content"
          >
            {/* Close Button */}
            <button 
              onClick={handleCloseSaveModal}
              className="absolute top-4 right-4 p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-all cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2.5 mb-4">
              <div className="p-2 bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 rounded-lg">
                <Bookmark className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white font-sans">
                  {editingStrategyId ? '修改策略組合設定' : '新增策略參數組合'}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  {editingStrategyId ? '調整此組合的幣種、合約本位、交易所與名稱' : '儲存您的初始本金、各層槓桿倍數及交易細節'}
                </p>
              </div>
            </div>

            <div className="space-y-4">
              {/* 覆蓋當前檢測 (僅於非單純修改且使用中組合時) */}
              {!editingStrategyId && currentSavedId && (
                <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3 text-xs space-y-2">
                  <p className="text-slate-400 font-medium">檢測到當前正在使用已儲存的設定：</p>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-indigo-400 font-bold truncate max-w-[200px]">{savedStrategies.find(s => s.id === currentSavedId)?.name}</span>
                    <button
                      onClick={() => {
                        handleOverwriteStrategy(currentSavedId);
                        setIsSaveModalOpen(false);
                      }}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs transition-all cursor-pointer shrink-0"
                    >
                      <Save className="w-3.5 h-3.5" />
                      直接覆蓋更新
                    </button>
                  </div>
                  <div className="border-t border-slate-800 pt-2 text-[10px] text-slate-500">
                    或在下方調整幣種、交易所並輸入名稱建立新組合：
                  </div>
                </div>
              )}

              {/* 幣種、合約本位與交易所選擇 */}
              <div className="space-y-3">
                {/* 幣種選擇 */}
                <div className="space-y-1">
                  <label className="text-xs text-slate-300 font-medium flex items-center justify-between">
                    <span>選取交易幣種</span>
                    <span className="text-[10px] text-indigo-400 font-mono">Currency</span>
                  </label>
                  <select
                    value={selectedPreset}
                    onChange={(e) => {
                      const val = e.target.value;
                      setSelectedPreset(val);
                      const presetObj = PRESET_CRYPTOS.find(p => p.symbol === val);
                      const newCurrName = presetObj ? presetObj.symbol : (val === 'CUSTOM' ? customCurrencyName : val);
                      if (presetObj) setCustomCurrencyName(presetObj.symbol);
                      setSaveName(generateDefaultName(newCurrName, contractType));
                    }}
                    className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-xl px-3 py-2 text-xs font-semibold text-slate-200 focus:outline-none"
                  >
                    {PRESET_CRYPTOS.map(p => (
                      <option key={p.symbol} value={p.symbol}>{p.name} ({p.symbol})</option>
                    ))}
                    <option value="CUSTOM">自訂幣種名稱...</option>
                  </select>

                  {selectedPreset === 'CUSTOM' && (
                    <input
                      type="text"
                      value={customCurrencyName}
                      onChange={(e) => {
                        const val = e.target.value.toUpperCase();
                        setCustomCurrencyName(val);
                        setSaveName(generateDefaultName(val || 'CUSTOM', contractType));
                      }}
                      className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-xl px-3 py-2 text-xs text-emerald-400 font-mono focus:outline-none mt-1.5"
                      placeholder="請輸入幣種代碼 (如 SOL, DOGE)"
                    />
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {/* 合約本位 */}
                  <div className="space-y-1">
                    <label className="text-xs text-slate-300 font-medium">合約本位</label>
                    <select
                      value={contractType}
                      onChange={(e) => {
                        const newType = e.target.value as ContractType;
                        setContractType(newType);
                        setSaveName(generateDefaultName(customCurrencyName, newType));
                      }}
                      className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-xl px-3 py-2 text-xs font-semibold text-slate-200 focus:outline-none"
                    >
                      <option value={ContractType.USDT_MARGINED}>U本位 (USDT-M)</option>
                      <option value={ContractType.COIN_MARGINED}>幣本位 (Coin-M)</option>
                    </select>
                  </div>

                  {/* 開倉交易所 */}
                  <div className="space-y-1">
                    <label className="text-xs text-slate-300 font-medium">開倉交易所</label>
                    <select
                      value={selectedExchange}
                      onChange={(e) => setSelectedExchange(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-xl px-3 py-2 text-xs font-semibold text-slate-200 focus:outline-none"
                    >
                      {PRESET_EXCHANGES.map(ex => (
                        <option key={ex} value={ex}>{ex}</option>
                      ))}
                      <option value="CUSTOM">自訂交易所...</option>
                    </select>
                  </div>
                </div>

                {/* 自訂交易所名稱 */}
                {selectedExchange === 'CUSTOM' && (
                  <div className="space-y-1">
                    <label className="text-xs text-slate-300 font-medium">自訂交易所名稱</label>
                    <input
                      type="text"
                      value={customExchangeName}
                      onChange={(e) => setCustomExchangeName(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-xl px-3 py-2 text-xs text-emerald-400 font-mono focus:outline-none"
                      placeholder="請輸入交易所名稱 (如 Bitfinex, BingX)"
                    />
                  </div>
                )}
              </div>

              {/* 名稱輸入 */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs text-slate-300 font-medium">設定組合名稱</label>
                  <button
                    type="button"
                    onClick={() => setSaveName(generateDefaultName(customCurrencyName, contractType))}
                    className="text-[10px] text-indigo-400 hover:text-indigo-300 transition-colors font-mono cursor-pointer"
                  >
                    ⚡ 自動填入預設名稱
                  </button>
                </div>
                <input
                  type="text"
                  value={saveName}
                  onChange={(e) => setSaveName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-medium"
                  placeholder="例如: BTC U本位 組合1"
                  id="save-preset-name-input"
                  maxLength={30}
                  autoFocus
                />
              </div>

              {/* 按鈕群組 */}
              <div className="flex gap-3 pt-2">
                <button
                  onClick={handleCloseSaveModal}
                  className="flex-1 border border-slate-800 hover:border-slate-700 bg-slate-900 text-slate-300 font-bold py-2.5 rounded-xl text-xs hover:text-white transition-all cursor-pointer"
                >
                  取消
                </button>
                <button
                  onClick={handleConfirmModalSave}
                  disabled={!saveName.trim()}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:pointer-events-none text-white font-bold py-2.5 rounded-xl text-xs transition-all shadow-lg shadow-indigo-600/15 cursor-pointer"
                >
                  {editingStrategyId ? '確認修改組合' : '確認建立新組合'}
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>

    {/* 未儲存變更提醒彈窗 */}
    <AnimatePresence>
      {pendingAction && (
        <div className="fixed inset-0 top-0 left-0 w-screen h-screen z-[100] flex items-center justify-center p-4" id="unsaved-modal-overlay">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm"
            onClick={() => setPendingAction(null)}
          />

          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ type: "spring", duration: 0.3 }}
            className="glass-card rounded-2xl p-6 w-full max-w-md shadow-2xl relative z-10 border-amber-500/40 glow-border-amber my-auto"
          >
            <button
              onClick={() => setPendingAction(null)}
              className="absolute top-4 right-4 p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-all cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="p-2.5 bg-amber-500/20 text-amber-400 border border-amber-500/40 rounded-xl animate-pulse">
                <ShieldAlert className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white font-sans">當前組合有未儲存的變更！</h3>
                <p className="text-xs text-amber-300/90 mt-0.5 font-medium">
                  直接切換或新增將會遺失您剛剛調整的槓桿與本金等設定。
                </p>
              </div>
            </div>

            <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3.5 text-xs text-slate-300 space-y-1.5 font-mono mb-5">
              <div className="flex justify-between">
                <span className="text-slate-400">正在編輯組合:</span>
                <span className="text-indigo-400 font-bold">{savedStrategies.find(s => s.id === currentSavedId)?.name || '未命名/暫存組合'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">狀態提醒:</span>
                <span className="text-amber-400 font-bold">⚠️ 有尚未儲存的修改參數</span>
              </div>
            </div>

            <div className="flex flex-col gap-2.5">
              <button
                onClick={() => handleExecutePendingAction(true)}
                className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2.5 rounded-xl text-xs transition-all shadow-lg shadow-indigo-600/20 flex items-center justify-center gap-2 cursor-pointer"
              >
                <Save className="w-4 h-4" />
                儲存並繼續
              </button>
              
              <button
                onClick={() => setPendingAction(null)}
                className="w-full bg-slate-900 hover:bg-slate-800 text-slate-300 font-bold py-2.5 rounded-xl text-xs border border-slate-700 transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                留在原地繼續修改
              </button>

              <button
                onClick={() => handleExecutePendingAction(false)}
                className="w-full bg-rose-950/40 hover:bg-rose-900/60 border border-rose-900/60 text-rose-300 font-bold py-2.5 rounded-xl text-xs transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                不儲存組合 繼續切換
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>

    {/* 浮動提示 Toast */}
    <AnimatePresence>
      {toastMessage && (
        <motion.div
          initial={{ opacity: 0, y: -20, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -20, scale: 0.9 }}
          className="fixed top-6 right-6 z-50 glass-card px-4 py-3 rounded-xl border border-indigo-500/40 shadow-2xl flex items-center gap-2.5 text-xs font-bold text-white glow-border-indigo"
        >
          <div className="p-1 bg-emerald-500/20 text-emerald-400 rounded-lg">
            <Check className="w-4 h-4" />
          </div>
          <span>{toastMessage}</span>
        </motion.div>
      )}
    </AnimatePresence>
  </div>
);
}
