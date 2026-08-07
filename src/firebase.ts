import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signInWithRedirect,
  getRedirectResult,
  signOut 
} from 'firebase/auth';
import { 
  getFirestore, 
  collection, 
  doc, 
  getDocs, 
  setDoc, 
  deleteDoc, 
  writeBatch,
  query,
  orderBy
} from 'firebase/firestore';
import { SavedStrategy } from './types';

// Client-side config from firebase-applet-config.json
const firebaseConfig = {
  apiKey: "AIzaSyA3FZDMVrObKY85DMhuZtUJo_RfWzzpblo",
  authDomain: "gen-lang-client-0538162980.firebaseapp.com",
  projectId: "gen-lang-client-0538162980",
  storageBucket: "gen-lang-client-0538162980.firebasestorage.app",
  messagingSenderId: "670141991309",
  appId: "1:670141991309:web:45a77df6d5144d185315c4"
};

// Initialize Firebase App
const app = initializeApp(firebaseConfig);

// Initialize Firebase Auth with Google Auth Provider
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

// Initialize Firestore (targeting the designated database ID if provided)
export const db = getFirestore(app, "ai-studio-fd4ce500-7bbd-4d5b-a6d6-aa304b4e8e71");

// Auth helper functions
export const signInWithGoogle = async () => {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  } catch (error) {
    console.error("Google Sign-In Error:", error);
    throw error;
  }
};

export const signInWithGoogleRedirect = async () => {
  try {
    await signInWithRedirect(auth, googleProvider);
  } catch (error) {
    console.error("Google Redirect Sign-In Error:", error);
    throw error;
  }
};

export const getRedirectSignInResult = async () => {
  try {
    const result = await getRedirectResult(auth);
    return result ? result.user : null;
  } catch (error) {
    console.error("Google Redirect Result Error:", error);
    throw error;
  }
};

export const logout = async () => {
  try {
    await signOut(auth);
  } catch (error) {
    console.error("Sign-Out Error:", error);
    throw error;
  }
};

/**
 * Firestore Database helper functions
 */

// Fetch all strategies of a user sorted by orderIndex
export const getUserStrategies = async (userId: string): Promise<SavedStrategy[]> => {
  try {
    const colRef = collection(db, 'users', userId, 'strategies');
    const snapshot = await getDocs(colRef);
    
    const strategies: SavedStrategy[] = [];
    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      strategies.push({
        id: docSnap.id,
        name: data.name || '',
        timestamp: data.timestamp || data.updatedAt || Date.now(),
        rollingMode: data.rollingMode,
        reinvestMode: data.reinvestMode,
        customMultiplier: data.customMultiplier,
        selectedPreset: data.selectedPreset,
        customCurrencyName: data.customCurrencyName,
        qtyDecimals: data.qtyDecimals,
        priceDecimals: data.priceDecimals,
        contractType: data.contractType,
        exchange: data.exchange || data.strategyParams?.exchange || 'Binance',
        deductFeeFromNetProfit: data.deductFeeFromNetProfit,
        deductFeeFromPositionSizing: data.deductFeeFromPositionSizing,
        activeLevelIndex: data.activeLevelIndex !== undefined ? data.activeLevelIndex : null,
        strategyParams: data.strategyParams ? {
          ...data.strategyParams,
          exchange: data.strategyParams.exchange || data.exchange || 'Binance'
        } : data.strategyParams,
        levelsState: data.levelsState || [],
        orderIndex: typeof data.orderIndex === 'number' ? data.orderIndex : 0,
      });
    });

    // Sort in memory: first by orderIndex, then by timestamp
    strategies.sort((a, b) => {
      const idxA = a.orderIndex ?? 0;
      const idxB = b.orderIndex ?? 0;
      if (idxA !== idxB) {
        return idxA - idxB;
      }
      return (a.timestamp || 0) - (b.timestamp || 0);
    });

    return strategies;
  } catch (error) {
    console.error("Error fetching user strategies:", error);
    throw error;
  }
};

// Helper to clean up any undefined properties, which Firestore rejects
function sanitizeForFirestore(obj: any): any {
  if (obj === undefined || obj === null) {
    return null;
  }
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeForFirestore(item));
  }
  if (typeof obj === 'object') {
    const cleaned: any = {};
    for (const key of Object.keys(obj)) {
      const val = obj[key];
      if (val !== undefined) {
        cleaned[key] = sanitizeForFirestore(val);
      }
    }
    return cleaned;
  }
  return obj;
}

// Save single strategy to user's Firestore collection
export const saveStrategyToFirestore = async (
  userId: string, 
  strategy: SavedStrategy, 
  orderIndex: number
): Promise<void> => {
  try {
    const docRef = doc(db, 'users', userId, 'strategies', strategy.id);
    const sanitized = sanitizeForFirestore(strategy);
    await setDoc(docRef, {
      ...sanitized,
      orderIndex,
      updatedAt: Date.now()
    });
  } catch (error) {
    console.error("Error saving strategy to Firestore:", error);
    throw error;
  }
};

// Delete single strategy from user's Firestore collection
export const deleteStrategyFromFirestore = async (
  userId: string, 
  strategyId: string
): Promise<void> => {
  try {
    const docRef = doc(db, 'users', userId, 'strategies', strategyId);
    await deleteDoc(docRef);
  } catch (error) {
    console.error("Error deleting strategy from Firestore:", error);
    throw error;
  }
};

// Batch save/sync the complete list of strategies, ensuring Firestore matches the list exactly
export const syncAllStrategiesToFirestore = async (
  userId: string, 
  strategies: SavedStrategy[]
): Promise<void> => {
  try {
    const colRef = collection(db, 'users', userId, 'strategies');
    const snapshot = await getDocs(colRef);
    const validIds = new Set(strategies.map(s => s.id));

    const batch = writeBatch(db);
    
    // Delete documents in Firestore that are no longer in the strategies list
    snapshot.forEach((docSnap) => {
      if (!validIds.has(docSnap.id)) {
        batch.delete(docSnap.ref);
      }
    });

    // Save all current strategies with their order indices
    strategies.forEach((strategy, index) => {
      const docRef = doc(db, 'users', userId, 'strategies', strategy.id);
      const sanitized = sanitizeForFirestore(strategy);
      batch.set(docRef, {
        ...sanitized,
        orderIndex: index,
        updatedAt: Date.now()
      });
    });
    
    await batch.commit();
  } catch (error) {
    console.error("Error batch syncing strategies to Firestore:", error);
    throw error;
  }
};

