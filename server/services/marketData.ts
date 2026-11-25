import type {
  AssetClass,
  MarketDetailsResponse,
  MarketHistoryResponse,
  MarketOhlcvResponse,
  MarketSymbolsResponse,
  OHLCVBar,
  SymbolInfo,
  Timeframe,
} from '../../shared/types.js';

export const SEED_ANCHOR_EPOCH_SEC = 1795190400; // 2026-11-20T16:00:00Z
export const MAX_SEEDED_BARS = 1000;
export const DEFAULT_OHLCV_LIMIT = 300;
export const MAX_ULTRA_BARS = 40_000;
export const DEFAULT_ULTRA_LIMIT = 3_000;

export const TIMEFRAME_SECONDS: Record<Timeframe, number> = {
  '1m': 60,
  '5m': 300,
  '15m': 900,
  '1h': 3600,
  '4h': 14400,
  '1D': 86400,
  '1W': 604800,
  '1M': 2592000,
};

export const VALID_TIMEFRAMES = Object.keys(TIMEFRAME_SECONDS) as Timeframe[];
export const VALID_ASSET_CLASSES: ReadonlyArray<AssetClass | 'all'> = [
  'all',
  'stocks',
  'crypto',
  'indices',
  'forex',
  'metals',
];

interface SymbolSpec {
  symbol: string;
  name: string;
  exchange: string;
  assetClass: AssetClass;
  basePrice: number;
  precision: number;
  dailyVol: number;
  baseDailyVolume: number;
  marketCap?: string;
  peRatio?: number;
  dividendYield?: number;
  sector?: string;
  currency: string;
  aliases?: string[];
  yahooSymbol?: string;
}

const SYMBOL_SPECS: readonly SymbolSpec[] = [
  {
    symbol: 'AAPL',
    name: 'Apple Inc.',
    exchange: 'NASDAQ',
    assetClass: 'stocks',
    basePrice: 228.5,
    precision: 2,
    dailyVol: 0.017,
    baseDailyVolume: 44_690_000,
    marketCap: '3.48T',
    peRatio: 35.2,
    dividendYield: 0.44,
    sector: 'Technology',
    currency: 'USD',
    yahooSymbol: 'AAPL',
  },
  {
    symbol: 'NVDA',
    name: 'NVIDIA Corporation',
    exchange: 'NASDAQ',
    assetClass: 'stocks',
    basePrice: 141.2,
    precision: 2,
    dailyVol: 0.028,
    baseDailyVolume: 215_400_000,
    marketCap: '3.46T',
    peRatio: 54.8,
    dividendYield: 0.03,
    sector: 'Semiconductors',
    currency: 'USD',
    yahooSymbol: 'NVDA',
  },
  {
    symbol: 'TSLA',
    name: 'Tesla, Inc.',
    exchange: 'NASDAQ',
    assetClass: 'stocks',
    basePrice: 338.6,
    precision: 2,
    dailyVol: 0.027,
    baseDailyVolume: 89_200_000,
    marketCap: '1.08T',
    peRatio: 92.4,
    sector: 'Automotive & Energy',
    currency: 'USD',
    yahooSymbol: 'TSLA',
  },
  {
    symbol: 'MSFT',
    name: 'Microsoft Corporation',
    exchange: 'NASDAQ',
    assetClass: 'stocks',
    basePrice: 418.9,
    precision: 2,
    dailyVol: 0.016,
    baseDailyVolume: 22_800_000,
    marketCap: '3.11T',
    peRatio: 34.6,
    dividendYield: 0.79,
    sector: 'Technology',
    currency: 'USD',
    yahooSymbol: 'MSFT',
  },
  {
    symbol: 'NFLX',
    name: 'Netflix, Inc.',
    exchange: 'NASDAQ',
    assetClass: 'stocks',
    basePrice: 865.4,
    precision: 2,
    dailyVol: 0.021,
    baseDailyVolume: 4_150_000,
    marketCap: '371B',
    peRatio: 44.1,
    sector: 'Communication Services',
    currency: 'USD',
    yahooSymbol: 'NFLX',
  },
  {
    symbol: 'AMZN',
    name: 'Amazon.com, Inc.',
    exchange: 'NASDAQ',
    assetClass: 'stocks',
    basePrice: 207.8,
    precision: 2,
    dailyVol: 0.019,
    baseDailyVolume: 38_900_000,
    marketCap: '2.18T',
    peRatio: 44.5,
    sector: 'Consumer Cyclical',
    currency: 'USD',
    yahooSymbol: 'AMZN',
  },
  {
    symbol: 'BTCUSDT',
    name: 'Bitcoin / TetherUS',
    exchange: 'BINANCE',
    assetClass: 'crypto',
    basePrice: 93_800,
    precision: 2,
    dailyVol: 0.031,
    baseDailyVolume: 31_500,
    marketCap: '1.85T',
    sector: 'Cryptocurrency',
    currency: 'USDT',
    aliases: ['BTCUSD'],
  },
  {
    symbol: 'ETHUSDT',
    name: 'Ethereum / TetherUS',
    exchange: 'BINANCE',
    assetClass: 'crypto',
    basePrice: 3_280,
    precision: 2,
    dailyVol: 0.035,
    baseDailyVolume: 420_000,
    marketCap: '395B',
    sector: 'Cryptocurrency',
    currency: 'USDT',
    aliases: ['ETHUSD'],
  },
  {
    symbol: 'SOLUSDT',
    name: 'Solana / TetherUS',
    exchange: 'BINANCE',
    assetClass: 'crypto',
    basePrice: 236.5,
    precision: 2,
    dailyVol: 0.044,
    baseDailyVolume: 4_850_000,
    marketCap: '112B',
    sector: 'Cryptocurrency',
    currency: 'USDT',
    aliases: ['SOLUSD'],
  },
  {
    symbol: 'SPX',
    name: 'S&P 500 Index',
    exchange: 'SP',
    assetClass: 'indices',
    basePrice: 5_925,
    precision: 2,
    dailyVol: 0.008,
    baseDailyVolume: 2_350_000_000,
    sector: 'Broad Market Index',
    currency: 'USD',
    yahooSymbol: '^GSPC',
  },
  {
    symbol: 'NDX',
    name: 'Nasdaq 100 Index',
    exchange: 'NASDAQ',
    assetClass: 'indices',
    basePrice: 20_680,
    precision: 2,
    dailyVol: 0.011,
    baseDailyVolume: 1_120_000_000,
    sector: 'Technology Index',
    currency: 'USD',
    aliases: ['NDQ'],
    yahooSymbol: '^NDX',
  },
  {
    symbol: 'DJI',
    name: 'Dow Jones Industrial Average',
    exchange: 'DJ',
    assetClass: 'indices',
    basePrice: 43_650,
    precision: 2,
    dailyVol: 0.007,
    baseDailyVolume: 410_000_000,
    sector: 'Industrial Index',
    currency: 'USD',
    yahooSymbol: '^DJI',
  },
  {
    symbol: 'DXY',
    name: 'U.S. Dollar Currency Index',
    exchange: 'ICEUS',
    assetClass: 'indices',
    basePrice: 106.85,
    precision: 3,
    dailyVol: 0.0036,
    baseDailyVolume: 92_000,
    sector: 'Currency Index',
    currency: 'USD',
    aliases: ['USDX'],
    yahooSymbol: 'DX-Y.NYB',
  },
  // ==========================================================================
  // Precious & Industrial Metals (Spot & Futures)
  // ==========================================================================
  {
    symbol: 'XAUUSD',
    name: 'Gold Spot / U.S. Dollar',
    exchange: 'OANDA',
    assetClass: 'metals',
    basePrice: 2_685.4,
    precision: 2,
    dailyVol: 0.011,
    baseDailyVolume: 218_000,
    sector: 'Precious Metal',
    currency: 'USD',
    aliases: ['GOLD', 'XAU/USD', 'GC', 'GC1!'],
    yahooSymbol: 'GC=F',
  },
  {
    symbol: 'XAGUSD',
    name: 'Silver Spot / U.S. Dollar',
    exchange: 'OANDA',
    assetClass: 'metals',
    basePrice: 31.285,
    precision: 3,
    dailyVol: 0.018,
    baseDailyVolume: 94_000,
    sector: 'Precious Metal',
    currency: 'USD',
    aliases: ['SILVER', 'XAG/USD', 'SI', 'SI1!'],
    yahooSymbol: 'SI=F',
  },
  {
    symbol: 'XPTUSD',
    name: 'Platinum Spot / U.S. Dollar',
    exchange: 'OANDA',
    assetClass: 'metals',
    basePrice: 968.5,
    precision: 2,
    dailyVol: 0.015,
    baseDailyVolume: 38_000,
    sector: 'Precious Metal',
    currency: 'USD',
    aliases: ['PLATINUM', 'XPT/USD', 'PL', 'PL1!'],
    yahooSymbol: 'PL=F',
  },
  {
    symbol: 'XPDUSD',
    name: 'Palladium Spot / U.S. Dollar',
    exchange: 'OANDA',
    assetClass: 'metals',
    basePrice: 1_014.2,
    precision: 2,
    dailyVol: 0.022,
    baseDailyVolume: 19_500,
    sector: 'Precious Metal',
    currency: 'USD',
    aliases: ['PALLADIUM', 'XPD/USD', 'PA', 'PA1!'],
    yahooSymbol: 'PA=F',
  },
  {
    symbol: 'XCUUSD',
    name: 'High-Grade Copper / U.S. Dollar',
    exchange: 'COMEX',
    assetClass: 'metals',
    basePrice: 4.185,
    precision: 4,
    dailyVol: 0.014,
    baseDailyVolume: 76_000,
    sector: 'Industrial Metal',
    currency: 'USD',
    aliases: ['COPPER', 'XCU/USD', 'HG', 'HG1!'],
    yahooSymbol: 'HG=F',
  },
  {
    symbol: 'XALUSD',
    name: 'Aluminum Futures / U.S. Dollar',
    exchange: 'COMEX',
    assetClass: 'metals',
    basePrice: 2_618.0,
    precision: 2,
    dailyVol: 0.012,
    baseDailyVolume: 28_000,
    sector: 'Industrial Metal',
    currency: 'USD',
    aliases: ['ALUMINUM', 'XAL/USD', 'ALI'],
    yahooSymbol: 'ALI=F',
  },
  {
    symbol: 'XAUEUR',
    name: 'Gold / Euro',
    exchange: 'OANDA',
    assetClass: 'metals',
    basePrice: 2_536.8,
    precision: 2,
    dailyVol: 0.01,
    baseDailyVolume: 64_000,
    sector: 'Precious Metal',
    currency: 'EUR',
    aliases: ['XAU/EUR', 'GOLDEUR'],
    yahooSymbol: 'XAUEUR=X',
  },
  {
    symbol: 'XAGEUR',
    name: 'Silver / Euro',
    exchange: 'OANDA',
    assetClass: 'metals',
    basePrice: 29.555,
    precision: 3,
    dailyVol: 0.017,
    baseDailyVolume: 31_000,
    sector: 'Precious Metal',
    currency: 'EUR',
    aliases: ['XAG/EUR', 'SILVEREUR'],
    yahooSymbol: 'XAGEUR=X',
  },
  // ==========================================================================
  // Forex — G10 Majors, All 21 Major Crosses & Liquid Exotics
  // ==========================================================================
  {
    symbol: 'EURUSD',
    name: 'Euro / U.S. Dollar',
    exchange: 'FX_IDC',
    assetClass: 'forex',
    basePrice: 1.0585,
    precision: 4,
    dailyVol: 0.0038,
    baseDailyVolume: 145_000,
    sector: 'Major FX Pair',
    currency: 'USD',
    aliases: ['EUR/USD', 'FIBER'],
    yahooSymbol: 'EURUSD=X',
  },
  {
    symbol: 'GBPUSD',
    name: 'British Pound / U.S. Dollar',
    exchange: 'FX_IDC',
    assetClass: 'forex',
    basePrice: 1.264,
    precision: 4,
    dailyVol: 0.0044,
    baseDailyVolume: 112_000,
    sector: 'Major FX Pair',
    currency: 'USD',
    aliases: ['GBP/USD', 'CABLE'],
    yahooSymbol: 'GBPUSD=X',
  },
  {
    symbol: 'USDJPY',
    name: 'U.S. Dollar / Japanese Yen',
    exchange: 'FX_IDC',
    assetClass: 'forex',
    basePrice: 154.625,
    precision: 3,
    dailyVol: 0.0052,
    baseDailyVolume: 138_000,
    sector: 'Major FX Pair',
    currency: 'JPY',
    aliases: ['USD/JPY', 'GOPHER'],
    yahooSymbol: 'JPY=X',
  },
  {
    symbol: 'USDCHF',
    name: 'U.S. Dollar / Swiss Franc',
    exchange: 'FX_IDC',
    assetClass: 'forex',
    basePrice: 0.8845,
    precision: 4,
    dailyVol: 0.0041,
    baseDailyVolume: 74_000,
    sector: 'Major FX Pair',
    currency: 'CHF',
    aliases: ['USD/CHF', 'SWISSIE'],
    yahooSymbol: 'CHF=X',
  },
  {
    symbol: 'AUDUSD',
    name: 'Australian Dollar / U.S. Dollar',
    exchange: 'FX_IDC',
    assetClass: 'forex',
    basePrice: 0.6518,
    precision: 4,
    dailyVol: 0.0051,
    baseDailyVolume: 88_000,
    sector: 'Major FX Pair',
    currency: 'USD',
    aliases: ['AUD/USD', 'AUSSIE'],
    yahooSymbol: 'AUDUSD=X',
  },
  {
    symbol: 'USDCAD',
    name: 'U.S. Dollar / Canadian Dollar',
    exchange: 'FX_IDC',
    assetClass: 'forex',
    basePrice: 1.3985,
    precision: 4,
    dailyVol: 0.0042,
    baseDailyVolume: 82_000,
    sector: 'Major FX Pair',
    currency: 'CAD',
    aliases: ['USD/CAD', 'LOONIE'],
    yahooSymbol: 'CAD=X',
  },
  {
    symbol: 'NZDUSD',
    name: 'New Zealand Dollar / U.S. Dollar',
    exchange: 'FX_IDC',
    assetClass: 'forex',
    basePrice: 0.5865,
    precision: 4,
    dailyVol: 0.0054,
    baseDailyVolume: 56_000,
    sector: 'Major FX Pair',
    currency: 'USD',
    aliases: ['NZD/USD', 'KIWI'],
    yahooSymbol: 'NZDUSD=X',
  },
  {
    symbol: 'EURGBP',
    name: 'Euro / British Pound',
    exchange: 'FX_IDC',
    assetClass: 'forex',
    basePrice: 0.8342,
    precision: 4,
    dailyVol: 0.0034,
    baseDailyVolume: 68_000,
    sector: 'Minor FX Cross',
    currency: 'GBP',
    aliases: ['EUR/GBP'],
    yahooSymbol: 'EURGBP=X',
  },
  {
    symbol: 'EURJPY',
    name: 'Euro / Japanese Yen',
    exchange: 'FX_IDC',
    assetClass: 'forex',
    basePrice: 163.45,
    precision: 3,
    dailyVol: 0.0055,
    baseDailyVolume: 79_000,
    sector: 'Minor FX Cross',
    currency: 'JPY',
    aliases: ['EUR/JPY'],
    yahooSymbol: 'EURJPY=X',
  },
  {
    symbol: 'GBPJPY',
    name: 'British Pound / Japanese Yen',
    exchange: 'FX_IDC',
    assetClass: 'forex',
    basePrice: 195.4,
    precision: 3,
    dailyVol: 0.0062,
    baseDailyVolume: 85_000,
    sector: 'Minor FX Cross',
    currency: 'JPY',
    aliases: ['GBP/JPY', 'DRAGON'],
    yahooSymbol: 'GBPJPY=X',
  },
  {
    symbol: 'AUDJPY',
    name: 'Australian Dollar / Japanese Yen',
    exchange: 'FX_IDC',
    assetClass: 'forex',
    basePrice: 100.78,
    precision: 3,
    dailyVol: 0.006,
    baseDailyVolume: 61_000,
    sector: 'Minor FX Cross',
    currency: 'JPY',
    aliases: ['AUD/JPY'],
    yahooSymbol: 'AUDJPY=X',
  },
  {
    symbol: 'EURAUD',
    name: 'Euro / Australian Dollar',
    exchange: 'FX_IDC',
    assetClass: 'forex',
    basePrice: 1.624,
    precision: 4,
    dailyVol: 0.0048,
    baseDailyVolume: 48_000,
    sector: 'Minor FX Cross',
    currency: 'AUD',
    aliases: ['EUR/AUD'],
    yahooSymbol: 'EURAUD=X',
  },
  {
    symbol: 'EURCHF',
    name: 'Euro / Swiss Franc',
    exchange: 'FX_IDC',
    assetClass: 'forex',
    basePrice: 0.9362,
    precision: 4,
    dailyVol: 0.0033,
    baseDailyVolume: 52_000,
    sector: 'Minor FX Cross',
    currency: 'CHF',
    aliases: ['EUR/CHF'],
    yahooSymbol: 'EURCHF=X',
  },
  {
    symbol: 'EURCAD',
    name: 'Euro / Canadian Dollar',
    exchange: 'FX_IDC',
    assetClass: 'forex',
    basePrice: 1.4795,
    precision: 4,
    dailyVol: 0.0043,
    baseDailyVolume: 46_000,
    sector: 'Minor FX Cross',
    currency: 'CAD',
    aliases: ['EUR/CAD'],
    yahooSymbol: 'EURCAD=X',
  },
  {
    symbol: 'EURNZD',
    name: 'Euro / New Zealand Dollar',
    exchange: 'FX_IDC',
    assetClass: 'forex',
    basePrice: 1.8045,
    precision: 4,
    dailyVol: 0.0052,
    baseDailyVolume: 34_000,
    sector: 'Minor FX Cross',
    currency: 'NZD',
    aliases: ['EUR/NZD'],
    yahooSymbol: 'EURNZD=X',
  },
  {
    symbol: 'GBPCHF',
    name: 'British Pound / Swiss Franc',
    exchange: 'FX_IDC',
    assetClass: 'forex',
    basePrice: 1.118,
    precision: 4,
    dailyVol: 0.0046,
    baseDailyVolume: 42_000,
    sector: 'Minor FX Cross',
    currency: 'CHF',
    aliases: ['GBP/CHF'],
    yahooSymbol: 'GBPCHF=X',
  },
  {
    symbol: 'GBPAUD',
    name: 'British Pound / Australian Dollar',
    exchange: 'FX_IDC',
    assetClass: 'forex',
    basePrice: 1.939,
    precision: 4,
    dailyVol: 0.0055,
    baseDailyVolume: 44_000,
    sector: 'Minor FX Cross',
    currency: 'AUD',
    aliases: ['GBP/AUD'],
    yahooSymbol: 'GBPAUD=X',
  },
  {
    symbol: 'GBPCAD',
    name: 'British Pound / Canadian Dollar',
    exchange: 'FX_IDC',
    assetClass: 'forex',
    basePrice: 1.768,
    precision: 4,
    dailyVol: 0.0047,
    baseDailyVolume: 41_000,
    sector: 'Minor FX Cross',
    currency: 'CAD',
    aliases: ['GBP/CAD'],
    yahooSymbol: 'GBPCAD=X',
  },
  {
    symbol: 'GBPNZD',
    name: 'British Pound / New Zealand Dollar',
    exchange: 'FX_IDC',
    assetClass: 'forex',
    basePrice: 2.155,
    precision: 4,
    dailyVol: 0.0058,
    baseDailyVolume: 33_000,
    sector: 'Minor FX Cross',
    currency: 'NZD',
    aliases: ['GBP/NZD'],
    yahooSymbol: 'GBPNZD=X',
  },
  {
    symbol: 'CADJPY',
    name: 'Canadian Dollar / Japanese Yen',
    exchange: 'FX_IDC',
    assetClass: 'forex',
    basePrice: 110.55,
    precision: 3,
    dailyVol: 0.0054,
    baseDailyVolume: 47_000,
    sector: 'Minor FX Cross',
    currency: 'JPY',
    aliases: ['CAD/JPY'],
    yahooSymbol: 'CADJPY=X',
  },
  {
    symbol: 'CHFJPY',
    name: 'Swiss Franc / Japanese Yen',
    exchange: 'FX_IDC',
    assetClass: 'forex',
    basePrice: 174.8,
    precision: 3,
    dailyVol: 0.0056,
    baseDailyVolume: 43_000,
    sector: 'Minor FX Cross',
    currency: 'JPY',
    aliases: ['CHF/JPY'],
    yahooSymbol: 'CHFJPY=X',
  },
  {
    symbol: 'NZDJPY',
    name: 'New Zealand Dollar / Japanese Yen',
    exchange: 'FX_IDC',
    assetClass: 'forex',
    basePrice: 90.68,
    precision: 3,
    dailyVol: 0.0059,
    baseDailyVolume: 38_000,
    sector: 'Minor FX Cross',
    currency: 'JPY',
    aliases: ['NZD/JPY'],
    yahooSymbol: 'NZDJPY=X',
  },
  {
    symbol: 'AUDNZD',
    name: 'Australian Dollar / New Zealand Dollar',
    exchange: 'FX_IDC',
    assetClass: 'forex',
    basePrice: 1.1112,
    precision: 4,
    dailyVol: 0.0038,
    baseDailyVolume: 39_000,
    sector: 'Minor FX Cross',
    currency: 'NZD',
    aliases: ['AUD/NZD'],
    yahooSymbol: 'AUDNZD=X',
  },
  {
    symbol: 'AUDCAD',
    name: 'Australian Dollar / Canadian Dollar',
    exchange: 'FX_IDC',
    assetClass: 'forex',
    basePrice: 0.9115,
    precision: 4,
    dailyVol: 0.0042,
    baseDailyVolume: 37_000,
    sector: 'Minor FX Cross',
    currency: 'CAD',
    aliases: ['AUD/CAD'],
    yahooSymbol: 'AUDCAD=X',
  },
  {
    symbol: 'AUDCHF',
    name: 'Australian Dollar / Swiss Franc',
    exchange: 'FX_IDC',
    assetClass: 'forex',
    basePrice: 0.5765,
    precision: 4,
    dailyVol: 0.0049,
    baseDailyVolume: 32_000,
    sector: 'Minor FX Cross',
    currency: 'CHF',
    aliases: ['AUD/CHF'],
    yahooSymbol: 'AUDCHF=X',
  },
  {
    symbol: 'CADCHF',
    name: 'Canadian Dollar / Swiss Franc',
    exchange: 'FX_IDC',
    assetClass: 'forex',
    basePrice: 0.6325,
    precision: 4,
    dailyVol: 0.0041,
    baseDailyVolume: 30_000,
    sector: 'Minor FX Cross',
    currency: 'CHF',
    aliases: ['CAD/CHF'],
    yahooSymbol: 'CADCHF=X',
  },
  {
    symbol: 'NZDCAD',
    name: 'New Zealand Dollar / Canadian Dollar',
    exchange: 'FX_IDC',
    assetClass: 'forex',
    basePrice: 0.8202,
    precision: 4,
    dailyVol: 0.0045,
    baseDailyVolume: 28_000,
    sector: 'Minor FX Cross',
    currency: 'CAD',
    aliases: ['NZD/CAD'],
    yahooSymbol: 'NZDCAD=X',
  },
  {
    symbol: 'NZDCHF',
    name: 'New Zealand Dollar / Swiss Franc',
    exchange: 'FX_IDC',
    assetClass: 'forex',
    basePrice: 0.5188,
    precision: 4,
    dailyVol: 0.005,
    baseDailyVolume: 26_000,
    sector: 'Minor FX Cross',
    currency: 'CHF',
    aliases: ['NZD/CHF'],
    yahooSymbol: 'NZDCHF=X',
  },
  {
    symbol: 'USDINR',
    name: 'U.S. Dollar / Indian Rupee',
    exchange: 'FX_IDC',
    assetClass: 'forex',
    basePrice: 84.425,
    precision: 3,
    dailyVol: 0.0028,
    baseDailyVolume: 96_000,
    sector: 'Exotic FX Pair',
    currency: 'INR',
    aliases: ['USD/INR'],
    yahooSymbol: 'INR=X',
  },
  {
    symbol: 'USDMXN',
    name: 'U.S. Dollar / Mexican Peso',
    exchange: 'FX_IDC',
    assetClass: 'forex',
    basePrice: 20.365,
    precision: 4,
    dailyVol: 0.0072,
    baseDailyVolume: 64_000,
    sector: 'Exotic FX Pair',
    currency: 'MXN',
    aliases: ['USD/MXN'],
    yahooSymbol: 'MXN=X',
  },
  {
    symbol: 'USDSGD',
    name: 'U.S. Dollar / Singapore Dollar',
    exchange: 'FX_IDC',
    assetClass: 'forex',
    basePrice: 1.3445,
    precision: 4,
    dailyVol: 0.0031,
    baseDailyVolume: 58_000,
    sector: 'Exotic FX Pair',
    currency: 'SGD',
    aliases: ['USD/SGD'],
    yahooSymbol: 'SGD=X',
  },
  {
    symbol: 'USDZAR',
    name: 'U.S. Dollar / South African Rand',
    exchange: 'FX_IDC',
    assetClass: 'forex',
    basePrice: 18.145,
    precision: 4,
    dailyVol: 0.0078,
    baseDailyVolume: 45_000,
    sector: 'Exotic FX Pair',
    currency: 'ZAR',
    aliases: ['USD/ZAR'],
    yahooSymbol: 'ZAR=X',
  },
  {
    symbol: 'USDTRY',
    name: 'U.S. Dollar / Turkish Lira',
    exchange: 'FX_IDC',
    assetClass: 'forex',
    basePrice: 34.585,
    precision: 4,
    dailyVol: 0.0065,
    baseDailyVolume: 51_000,
    sector: 'Exotic FX Pair',
    currency: 'TRY',
    aliases: ['USD/TRY'],
    yahooSymbol: 'TRY=X',
  },
  {
    symbol: 'USDCNH',
    name: 'U.S. Dollar / Offshore Chinese Yuan',
    exchange: 'FX_IDC',
    assetClass: 'forex',
    basePrice: 7.2465,
    precision: 4,
    dailyVol: 0.0032,
    baseDailyVolume: 89_000,
    sector: 'Exotic FX Pair',
    currency: 'CNH',
    aliases: ['USD/CNH', 'USDCNY'],
    yahooSymbol: 'CNH=X',
  },
  {
    symbol: 'USDHKD',
    name: 'U.S. Dollar / Hong Kong Dollar',
    exchange: 'FX_IDC',
    assetClass: 'forex',
    basePrice: 7.7825,
    precision: 4,
    dailyVol: 0.0012,
    baseDailyVolume: 54_000,
    sector: 'Exotic FX Pair',
    currency: 'HKD',
    aliases: ['USD/HKD'],
    yahooSymbol: 'HKD=X',
  },
  {
    symbol: 'USDSEK',
    name: 'U.S. Dollar / Swedish Krona',
    exchange: 'FX_IDC',
    assetClass: 'forex',
    basePrice: 10.945,
    precision: 4,
    dailyVol: 0.0056,
    baseDailyVolume: 36_000,
    sector: 'Scandinavian FX',
    currency: 'SEK',
    aliases: ['USD/SEK'],
    yahooSymbol: 'SEK=X',
  },
  {
    symbol: 'USDNOK',
    name: 'U.S. Dollar / Norwegian Krone',
    exchange: 'FX_IDC',
    assetClass: 'forex',
    basePrice: 11.065,
    precision: 4,
    dailyVol: 0.0061,
    baseDailyVolume: 34_000,
    sector: 'Scandinavian FX',
    currency: 'NOK',
    aliases: ['USD/NOK'],
    yahooSymbol: 'NOK=X',
  },
];

const SPEC_BY_SYMBOL = new Map<string, SymbolSpec>();
const ALIAS_TO_CANONICAL = new Map<string, string>();
const seededSeriesCache = new Map<string, OHLCVBar[]>();

for (const spec of SYMBOL_SPECS) {
  SPEC_BY_SYMBOL.set(spec.symbol, spec);
  ALIAS_TO_CANONICAL.set(spec.symbol, spec.symbol);
  if (spec.aliases) {
    for (const alias of spec.aliases) {
      ALIAS_TO_CANONICAL.set(alias.toUpperCase(), spec.symbol);
    }
  }
}

function fnv1a32(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function roundTo(value: number, precision: number): number {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

export class UnknownSymbolError extends Error {
  constructor(symbol: string) {
    super(`Unknown symbol: ${symbol}`);
    this.name = 'UnknownSymbolError';
  }
}

export function isLiveMarketEnabledByDefault(): boolean {
  const envVal = process.env.USE_LIVE_MARKET_DATA;
  if (envVal === 'true') return true;
  if (envVal === 'false') return false;
  return !process.env.VITEST && process.env.NODE_ENV !== 'test';
}

export function resolveSymbol(rawSymbol: string): string | null {
  const normalized = rawSymbol.trim().toUpperCase();
  if (!normalized) return null;
  return ALIAS_TO_CANONICAL.get(normalized) ?? null;
}

function isDynamicTickerCandidate(rawSymbol: string): string | null {
  const normalized = rawSymbol.trim().toUpperCase();
  if (!normalized || !/^[A-Z0-9^.=/-]{1,20}$/.test(normalized)) {
    return null;
  }
  return normalized;
}

function inferPrecision(price: number): number {
  if (!Number.isFinite(price) || price <= 0) return 2;
  if (price < 0.01) return 6;
  if (price < 10) return 4;
  return 2;
}

function isCryptoPairTicker(symbol: string): boolean {
  return symbol.length >= 6 && /(?:USDT|USDC|BUSD)$/i.test(symbol);
}

export function isValidTimeframe(raw: string): raw is Timeframe {
  return Object.prototype.hasOwnProperty.call(TIMEFRAME_SECONDS, raw);
}

export function isValidAssetClass(raw: string): raw is AssetClass | 'all' {
  return (VALID_ASSET_CLASSES as readonly string[]).includes(raw);
}

export function getSeededBars(
  rawSymbol: string,
  timeframe: Timeframe,
  limit = DEFAULT_OHLCV_LIMIT,
): OHLCVBar[] {
  const canonical = resolveSymbol(rawSymbol);
  if (!canonical) {
    throw new Error(`Unknown symbol: ${rawSymbol}`);
  }
  const spec = SPEC_BY_SYMBOL.get(canonical);
  if (!spec) {
    throw new Error(`Missing symbol spec: ${canonical}`);
  }

  const safeLimit = Number.isFinite(limit) ? limit : DEFAULT_OHLCV_LIMIT;
  const clampedLimit = Math.max(1, Math.min(MAX_SEEDED_BARS, Math.floor(safeLimit)));
  const cacheKey = `${canonical}:${timeframe}`;
  const cached = seededSeriesCache.get(cacheKey);
  if (cached) {
    return cached.slice(-clampedLimit).map((b) => ({ ...b }));
  }

  const stepSec = TIMEFRAME_SECONDS[timeframe];
  const endAligned = Math.floor(SEED_ANCHOR_EPOCH_SEC / stepSec) * stepSec;
  const startSec = endAligned - (MAX_SEEDED_BARS - 1) * stepSec;

  const rand = mulberry32(fnv1a32(`${canonical}:${timeframe}`));
  const minPrice = 10 ** -spec.precision;

  // Scale per-bar volatility gently across timeframes while keeping bar-to-bar moves bounded.
  const tfScale = Math.sqrt(stepSec / 86400);
  const stepVol = Math.min(0.032, Math.max(0.0012, spec.dailyVol * tfScale));
  const volumeScale = Math.max(0.02, Math.min(20, stepSec / 86400));
  const baseBarVol = Math.max(10, spec.baseDailyVolume * volumeScale);

  const phaseOffset = rand() * Math.PI * 2;
  let price = spec.basePrice * (0.94 + rand() * 0.12);
  const generated: OHLCVBar[] = new Array(MAX_SEEDED_BARS);

  for (let i = 0; i < MAX_SEEDED_BARS; i += 1) {
    const time = startSec + i * stepSec;

    // Mean reversion + slow cycle + quasi-Gaussian return + deterministic impulse spikes
    const meanPull = ((spec.basePrice - price) / spec.basePrice) * 0.018;
    const wave = Math.sin(i / 28 + phaseOffset) * stepVol * 0.18;
    const gaussianLike = (rand() + rand() + rand() - 1.5) * 1.15;
    const impulse =
      i > 20 && i % 67 === 12
        ? (rand() > 0.45 ? 1 : -1) * stepVol * 2.1
        : 0;

    const rawGap = (rand() - 0.5) * stepVol * 0.15;
    const boundedGap = Math.max(-0.02, Math.min(0.02, rawGap));
    const rawOpen = Math.max(minPrice, price * (1 + boundedGap));

    const rawReturn = meanPull + wave + gaussianLike * stepVol + impulse;
    const boundedReturn = Math.max(-0.045, Math.min(0.045, rawReturn));
    const rawClose = Math.max(minPrice, rawOpen * (1 + boundedReturn));

    const open = Math.max(minPrice, roundTo(rawOpen, spec.precision));
    const close = Math.max(minPrice, roundTo(rawClose, spec.precision));

    const refPrice = Math.max(open, close);
    const upperWick = (0.08 + rand() * 0.65) * stepVol * refPrice;
    const lowerWick = (0.08 + rand() * 0.65) * stepVol * refPrice;

    let high = roundTo(Math.max(open, close) + upperWick, spec.precision);
    let low = roundTo(Math.min(open, close) - lowerWick, spec.precision);

    high = Math.max(high, open, close);
    low = Math.max(minPrice, Math.min(low, open, close));

    const bodyPct = Math.abs(close - open) / Math.max(open, minPrice);
    const spikeVolBoost = impulse !== 0 ? 1.85 : 1;
    const volume = Math.max(
      1,
      Math.round(baseBarVol * (0.55 + rand() * 1.3) * (1 + bodyPct * 8) * spikeVolBoost),
    );

    generated[i] = {
      time,
      open,
      high,
      low,
      close,
      volume,
    };

    price = close;
  }

  seededSeriesCache.set(cacheKey, generated);
  return generated.slice(-clampedLimit).map((b) => ({ ...b }));
}

function buildSymbolInfo(spec: SymbolSpec): SymbolInfo {
  const dailyBars = getSeededBars(spec.symbol, '1D', DEFAULT_OHLCV_LIMIT);
  const latest = dailyBars[dailyBars.length - 1];
  const prev = dailyBars[dailyBars.length - 2] ?? latest;
  const change = roundTo(latest.close - prev.close, spec.precision);
  const changePercent =
    prev.close > 0 ? roundTo((change / prev.close) * 100, 2) : 0;

  const trailing30 = dailyBars.slice(-30);
  const avgVolume30d = Math.max(
    1,
    Math.round(trailing30.reduce((sum, bar) => sum + bar.volume, 0) / trailing30.length),
  );

  return {
    symbol: spec.symbol,
    name: spec.name,
    exchange: spec.exchange,
    assetClass: spec.assetClass,
    last: latest.close,
    change,
    changePercent,
    volume: latest.volume,
    avgVolume30d,
    marketCap: spec.marketCap,
    peRatio: spec.peRatio,
    dividendYield: spec.dividendYield,
    sector: spec.sector,
    currency: spec.currency,
    marketOpen: true,
    dataSource: 'seeded',
  };
}

export function listSymbols(options?: {
  q?: string;
  assetClass?: AssetClass | 'all';
}): SymbolInfo[] {
  const query = options?.q?.trim().toLowerCase() ?? '';
  const assetClass = options?.assetClass ?? 'all';

  return SYMBOL_SPECS.filter((spec) => {
    if (assetClass !== 'all' && spec.assetClass !== assetClass) {
      return false;
    }
    if (!query) return true;
    const aliasMatch = spec.aliases?.some((a) => a.toLowerCase().includes(query)) ?? false;
    return (
      spec.symbol.toLowerCase().includes(query) ||
      spec.name.toLowerCase().includes(query) ||
      spec.exchange.toLowerCase().includes(query) ||
      aliasMatch
    );
  }).map(buildSymbolInfo);
}

export function getSymbolDetails(rawSymbol: string): MarketDetailsResponse | null {
  const canonical = resolveSymbol(rawSymbol);
  if (!canonical) return null;
  const spec = SPEC_BY_SYMBOL.get(canonical);
  if (!spec) return null;
  return { details: buildSymbolInfo(spec) };
}

// ============================================================================
// Optional Live Proxy + Bounded In-Memory TTL Cache + Automatic Fallback
// ============================================================================

interface CacheEntry {
  expiresAt: number;
  bars: OHLCVBar[];
}

interface QuoteCacheEntry {
  expiresAt: number;
  info: SymbolInfo;
}

interface SearchCacheEntry {
  expiresAt: number;
  symbols: SymbolInfo[];
}

const LIVE_CACHE_MAX_ENTRIES = 500;
const LIVE_FETCH_TIMEOUT_MS = 4500;
const LIVE_QUOTE_TTL_MS = 12_000;
const LIVE_SEARCH_TTL_MS = 60_000;

const liveCache = new Map<string, CacheEntry>();
const liveQuoteCache = new Map<string, QuoteCacheEntry>();
const liveSearchCache = new Map<string, SearchCacheEntry>();
const ultraSeriesCache = new Map<
  string,
  { expiresAt: number; source: 'seeded' | 'live' | 'ultra_hybrid'; bars: OHLCVBar[] }
>();

export function clearMarketCache(): void {
  liveCache.clear();
  liveQuoteCache.clear();
  liveSearchCache.clear();
  ultraSeriesCache.clear();
}

const BINANCE_INTERVAL_MAP: Record<Timeframe, string> = {
  '1m': '1m',
  '5m': '5m',
  '15m': '15m',
  '1h': '1h',
  '4h': '4h',
  '1D': '1d',
  '1W': '1w',
  '1M': '1M',
};

const YAHOO_INTERVAL_MAP: Record<Timeframe, { interval: string; range: string; aggregate4h?: boolean }> = {
  '1m': { interval: '1m', range: '5d' },
  '5m': { interval: '5m', range: '1mo' },
  '15m': { interval: '15m', range: '1mo' },
  '1h': { interval: '1h', range: '6mo' },
  '4h': { interval: '1h', range: '1y', aggregate4h: true },
  '1D': { interval: '1d', range: '2y' },
  '1W': { interval: '1wk', range: '5y' },
  '1M': { interval: '1mo', range: '10y' },
};

function cacheTtlMs(timeframe: Timeframe): number {
  return TIMEFRAME_SECONDS[timeframe] < 86400 ? 5_000 : 15_000;
}

export function isCryptoTicker(rawSymbol: string): boolean {
  const canonical = resolveSymbol(rawSymbol);
  if (canonical) {
    return SPEC_BY_SYMBOL.get(canonical)?.assetClass === 'crypto';
  }
  const candidate = isDynamicTickerCandidate(rawSymbol);
  return candidate ? isCryptoPairTicker(candidate) : false;
}

export function getYahooTicker(rawSymbol: string): string | null {
  const canonical = resolveSymbol(rawSymbol);
  if (canonical) {
    const spec = SPEC_BY_SYMBOL.get(canonical);
    if (!spec || spec.assetClass === 'crypto') return null;
    return spec.yahooSymbol ?? spec.symbol;
  }
  const candidate = isDynamicTickerCandidate(rawSymbol);
  if (!candidate || isCryptoPairTicker(candidate)) return null;
  return candidate;
}

export function resolveCanonicalFromYahoo(yahooSymbol: string): string {
  const upper = yahooSymbol.trim().toUpperCase();
  for (const spec of SYMBOL_SPECS) {
    if (spec.yahooSymbol && spec.yahooSymbol.toUpperCase() === upper) {
      return spec.symbol;
    }
  }
  return resolveSymbol(upper) ?? upper;
}

export function getBinanceInterval(timeframe: Timeframe): string {
  return BINANCE_INTERVAL_MAP[timeframe];
}

export function getSymbolPrecision(rawSymbol: string, priceHint?: number): number {
  const canonical = resolveSymbol(rawSymbol);
  const spec = canonical ? SPEC_BY_SYMBOL.get(canonical) : undefined;
  if (spec) return spec.precision;
  return inferPrecision(priceHint ?? 100);
}

function getCachedLiveBars(key: string): OHLCVBar[] | null {
  const hit = liveCache.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    liveCache.delete(key);
    return null;
  }
  return hit.bars;
}

function setCachedLiveBars(key: string, timeframe: Timeframe, bars: OHLCVBar[]): void {
  if (liveCache.size >= LIVE_CACHE_MAX_ENTRIES) {
    const oldestKey = liveCache.keys().next().value;
    if (oldestKey !== undefined) {
      liveCache.delete(oldestKey);
    }
  }
  liveCache.set(key, {
    expiresAt: Date.now() + cacheTtlMs(timeframe),
    bars,
  });
}

function getCachedLiveQuote(symbol: string): SymbolInfo | null {
  const hit = liveQuoteCache.get(symbol);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    liveQuoteCache.delete(symbol);
    return null;
  }
  return hit.info;
}

function setCachedLiveQuote(symbol: string, info: SymbolInfo): void {
  if (liveQuoteCache.size >= LIVE_CACHE_MAX_ENTRIES) {
    const oldestKey = liveQuoteCache.keys().next().value;
    if (oldestKey !== undefined) {
      liveQuoteCache.delete(oldestKey);
    }
  }
  liveQuoteCache.set(symbol, {
    expiresAt: Date.now() + LIVE_QUOTE_TTL_MS,
    info,
  });
}

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LIVE_FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchBinanceKlines(
  symbol: string,
  timeframe: Timeframe,
  limit: number,
): Promise<OHLCVBar[]> {
  const interval = BINANCE_INTERVAL_MAP[timeframe];
  const url = `https://data-api.binance.vision/api/v3/klines?symbol=${encodeURIComponent(
    symbol,
  )}&interval=${encodeURIComponent(interval)}&limit=${limit}`;
  const res = await fetchWithTimeout(url);
  if (!res.ok) {
    throw new Error(`Binance HTTP ${res.status}`);
  }
  const data: unknown = await res.json();
  if (!Array.isArray(data)) {
    throw new Error('Unexpected Binance response shape');
  }

  const deduped = new Map<number, OHLCVBar>();
  for (const row of data) {
    if (!Array.isArray(row) || row.length < 6) continue;
    const time = Math.floor(Number(row[0]) / 1000);
    const open = Number(row[1]);
    const high = Number(row[2]);
    const low = Number(row[3]);
    const close = Number(row[4]);
    const volume = Math.max(1, Math.round(Number(row[5]) || 1));
    if (
      Number.isFinite(time) &&
      Number.isFinite(open) &&
      Number.isFinite(high) &&
      Number.isFinite(low) &&
      Number.isFinite(close) &&
      open > 0 &&
      high > 0 &&
      low > 0 &&
      close > 0 &&
      Number.isFinite(volume)
    ) {
      deduped.set(time, {
        time,
        open,
        high: Math.max(high, open, close),
        low: Math.min(low, open, close),
        close,
        volume,
      });
    }
  }
  return Array.from(deduped.values()).sort((a, b) => a.time - b.time);
}

function aggregate4hBars(hourlyBars: OHLCVBar[]): OHLCVBar[] {
  const buckets = new Map<number, OHLCVBar>();
  for (const bar of hourlyBars) {
    const bucketTime = Math.floor(bar.time / 14400) * 14400;
    const existing = buckets.get(bucketTime);
    if (!existing) {
      buckets.set(bucketTime, { ...bar, time: bucketTime });
    } else {
      existing.high = Math.max(existing.high, bar.high);
      existing.low = Math.min(existing.low, bar.low);
      existing.close = bar.close;
      existing.volume += bar.volume;
    }
  }
  return Array.from(buckets.values()).sort((a, b) => a.time - b.time);
}

interface YahooChartMeta {
  currency?: string;
  symbol?: string;
  exchangeName?: string;
  fullExchangeName?: string;
  instrumentType?: string;
  regularMarketPrice?: number;
  fulldayChange?: number;
  fulldayChangePercent?: number;
  chartPreviousClose?: number;
  previousClose?: number;
  regularMarketDayHigh?: number;
  regularMarketDayLow?: number;
  fiftyTwoWeekHigh?: number;
  fiftyTwoWeekLow?: number;
  regularMarketVolume?: number;
  longName?: string;
  shortName?: string;
  currentTradingPeriod?: {
    regular?: {
      start?: number;
      end?: number;
    };
  };
}

interface YahooChartPayload {
  chart?: {
    result?: Array<{
      meta?: YahooChartMeta;
      timestamp?: number[];
      indicators?: {
        quote?: Array<{
          open?: Array<number | null>;
          high?: Array<number | null>;
          low?: Array<number | null>;
          close?: Array<number | null>;
          volume?: Array<number | null>;
        }>;
      };
    }>;
  };
}

interface Binance24hTickerItem {
  symbol?: string;
  priceChange?: string;
  priceChangePercent?: string;
  lastPrice?: string;
  bidPrice?: string;
  askPrice?: string;
  highPrice?: string;
  lowPrice?: string;
  volume?: string;
}

interface YahooSearchPayload {
  quotes?: Array<{
    symbol?: string;
    shortname?: string;
    longname?: string;
    exchange?: string;
    exchDisp?: string;
    quoteType?: string;
    isYahooFinance?: boolean;
  }>;
}

function mapYahooQuoteTypeToAssetClass(quoteType?: string, symbolHint?: string): AssetClass | null {
  const sym = (symbolHint ?? '').toUpperCase();
  if (/^(?:XAU|XAG|XPT|XPD|XCU|XAL|GC=F|SI=F|PL=F|PA=F|HG=F|ALI=F)/.test(sym)) {
    return 'metals';
  }
  switch (quoteType?.toUpperCase()) {
    case 'EQUITY':
    case 'ETF':
    case 'MUTUALFUND':
      return 'stocks';
    case 'CRYPTOCURRENCY':
      return 'crypto';
    case 'INDEX':
      return 'indices';
    case 'CURRENCY':
      return 'forex';
    case 'FUTURE':
      return 'metals';
    default:
      return null;
  }
}

async function fetchYahooJson(pathAndQuery: string): Promise<Response> {
  const primary = `https://query1.finance.yahoo.com${pathAndQuery}`;
  try {
    const res = await fetchWithTimeout(primary);
    if (res.ok || (res.status !== 429 && res.status < 500)) {
      return res;
    }
  } catch {
    // Retry secondary Yahoo endpoint below
  }
  return fetchWithTimeout(`https://query2.finance.yahoo.com${pathAndQuery}`);
}

function buildLiveSymbolInfoFromYahoo(
  canonicalSymbol: string,
  meta: YahooChartMeta | undefined,
  bars: OHLCVBar[],
  spec?: SymbolSpec,
): SymbolInfo | null {
  const latestBar = bars[bars.length - 1];
  const prevBar = bars[bars.length - 2] ?? latestBar;
  const rawLast =
    typeof meta?.regularMarketPrice === 'number' && Number.isFinite(meta.regularMarketPrice)
      ? meta.regularMarketPrice
      : latestBar?.close;
  if (typeof rawLast !== 'number' || !Number.isFinite(rawLast) || rawLast <= 0) {
    return null;
  }

  const precision = spec?.precision ?? inferPrecision(rawLast);
  const last = roundTo(rawLast, precision);

  let change: number;
  let changePercent: number;
  if (
    typeof meta?.fulldayChange === 'number' &&
    Number.isFinite(meta.fulldayChange) &&
    typeof meta.fulldayChangePercent === 'number' &&
    Number.isFinite(meta.fulldayChangePercent)
  ) {
    change = roundTo(meta.fulldayChange, precision);
    changePercent = roundTo(meta.fulldayChangePercent, 2);
  } else {
    const refPrev =
      typeof meta?.chartPreviousClose === 'number' && Number.isFinite(meta.chartPreviousClose)
        ? meta.chartPreviousClose
        : typeof meta?.previousClose === 'number' && Number.isFinite(meta.previousClose)
          ? meta.previousClose
          : prevBar?.close ?? last;
    change = roundTo(last - refPrev, precision);
    changePercent = refPrev > 0 ? roundTo((change / refPrev) * 100, 2) : 0;
  }

  const volume = Math.max(
    1,
    Math.round(
      typeof meta?.regularMarketVolume === 'number' &&
        Number.isFinite(meta.regularMarketVolume) &&
        meta.regularMarketVolume > 0
        ? meta.regularMarketVolume
        : latestBar?.volume ?? spec?.baseDailyVolume ?? 1,
    ),
  );

  const avgVol =
    bars.length > 0
      ? Math.max(
          1,
          Math.round(bars.reduce((s, b) => s + b.volume, 0) / bars.length),
        )
      : spec?.baseDailyVolume ?? volume;

  const reg = meta?.currentTradingPeriod?.regular;
  const nowSec = Math.floor(Date.now() / 1000);
  const marketOpen =
    reg && typeof reg.start === 'number' && typeof reg.end === 'number'
      ? nowSec >= reg.start && nowSec <= reg.end
      : true;

  const fallbackInfo = spec ? buildSymbolInfo(spec) : null;
  const inferredAsset =
    spec?.assetClass ?? mapYahooQuoteTypeToAssetClass(meta?.instrumentType) ?? 'stocks';

  return {
    symbol: canonicalSymbol,
    name: spec?.name ?? meta?.longName ?? meta?.shortName ?? canonicalSymbol,
    exchange: spec?.exchange ?? meta?.fullExchangeName ?? meta?.exchangeName ?? 'NASDAQ',
    assetClass: inferredAsset,
    last,
    change,
    changePercent,
    volume,
    avgVolume30d: fallbackInfo?.avgVolume30d ?? avgVol,
    marketCap: spec?.marketCap,
    peRatio: spec?.peRatio,
    dividendYield: spec?.dividendYield,
    sector: spec?.sector,
    currency: spec?.currency ?? meta?.currency ?? 'USD',
    marketOpen,
    dayHigh:
      typeof meta?.regularMarketDayHigh === 'number'
        ? roundTo(meta.regularMarketDayHigh, precision)
        : latestBar?.high,
    dayLow:
      typeof meta?.regularMarketDayLow === 'number'
        ? roundTo(meta.regularMarketDayLow, precision)
        : latestBar?.low,
    fiftyTwoWeekHigh:
      typeof meta?.fiftyTwoWeekHigh === 'number'
        ? roundTo(meta.fiftyTwoWeekHigh, precision)
        : undefined,
    fiftyTwoWeekLow:
      typeof meta?.fiftyTwoWeekLow === 'number'
        ? roundTo(meta.fiftyTwoWeekLow, precision)
        : undefined,
    dataSource: 'live',
    updatedAt: new Date().toISOString(),
  };
}

async function fetchYahooChartWithMeta(
  yahooSymbol: string,
  timeframe: Timeframe,
  limit: number,
  precisionOverride?: number,
): Promise<{ bars: OHLCVBar[]; meta?: YahooChartMeta }> {
  const cfg = YAHOO_INTERVAL_MAP[timeframe];
  const pathAndQuery = `/v8/finance/chart/${encodeURIComponent(
    yahooSymbol,
  )}?interval=${encodeURIComponent(cfg.interval)}&range=${encodeURIComponent(cfg.range)}`;

  const res = await fetchYahooJson(pathAndQuery);
  if (!res.ok) {
    throw new Error(`Yahoo HTTP ${res.status}`);
  }
  const json = (await res.json()) as YahooChartPayload;
  const result = json.chart?.result?.[0];
  const timestamps = result?.timestamp;
  const quote = result?.indicators?.quote?.[0];
  if (!Array.isArray(timestamps) || !quote) {
    throw new Error('Unexpected Yahoo Finance response shape');
  }

  let sampleClose = result?.meta?.regularMarketPrice ?? 0;
  if (!Number.isFinite(sampleClose) || sampleClose <= 0) {
    const firstValid = quote.close?.find(
      (c): c is number => typeof c === 'number' && Number.isFinite(c) && c > 0,
    );
    sampleClose = firstValid ?? 100;
  }
  const precision = precisionOverride ?? inferPrecision(sampleClose);

  const deduped = new Map<number, OHLCVBar>();
  for (let i = 0; i < timestamps.length; i += 1) {
    const t = timestamps[i];
    const o = quote.open?.[i];
    const h = quote.high?.[i];
    const l = quote.low?.[i];
    const c = quote.close?.[i];
    const v = quote.volume?.[i];

    if (
      typeof t !== 'number' ||
      !Number.isFinite(t) ||
      typeof o !== 'number' ||
      !Number.isFinite(o) ||
      typeof h !== 'number' ||
      !Number.isFinite(h) ||
      typeof l !== 'number' ||
      !Number.isFinite(l) ||
      typeof c !== 'number' ||
      !Number.isFinite(c) ||
      o <= 0 ||
      h <= 0 ||
      l <= 0 ||
      c <= 0
    ) {
      continue;
    }

    const open = roundTo(o, precision);
    const close = roundTo(c, precision);
    const high = Math.max(roundTo(h, precision), open, close);
    const low = Math.min(roundTo(l, precision), open, close);
    const volume = Math.max(1, Math.round(typeof v === 'number' && Number.isFinite(v) ? v : 1));

    deduped.set(t, { time: t, open, high, low, close, volume });
  }

  let bars = Array.from(deduped.values()).sort((a, b) => a.time - b.time);
  if (cfg.aggregate4h) {
    bars = aggregate4hBars(bars);
  }
  return {
    bars: bars.slice(-limit),
    meta: result?.meta,
  };
}

async function fetchBinance24hTickers(symbols: string[]): Promise<Map<string, SymbolInfo>> {
  const result = new Map<string, SymbolInfo>();
  if (symbols.length === 0) return result;

  const url =
    symbols.length === 1
      ? `https://data-api.binance.vision/api/v3/ticker/24hr?symbol=${encodeURIComponent(symbols[0])}`
      : `https://data-api.binance.vision/api/v3/ticker/24hr?symbols=${encodeURIComponent(
          JSON.stringify(symbols),
        )}`;

  const res = await fetchWithTimeout(url);
  if (!res.ok) {
    throw new Error(`Binance 24hr HTTP ${res.status}`);
  }
  const raw: unknown = await res.json();
  const rows: Binance24hTickerItem[] = Array.isArray(raw)
    ? (raw as Binance24hTickerItem[])
    : raw && typeof raw === 'object'
      ? [raw as Binance24hTickerItem]
      : [];

  const nowIso = new Date().toISOString();
  for (const row of rows) {
    const sym = typeof row.symbol === 'string' ? row.symbol.toUpperCase() : '';
    const lastRaw = Number(row.lastPrice);
    if (!sym || !Number.isFinite(lastRaw) || lastRaw <= 0) continue;

    const spec = SPEC_BY_SYMBOL.get(sym);
    const precision = spec?.precision ?? inferPrecision(lastRaw);
    const last = roundTo(lastRaw, precision);
    const changeRaw = Number(row.priceChange);
    const changePctRaw = Number(row.priceChangePercent);
    const volRaw = Number(row.volume);
    const bidRaw = Number(row.bidPrice);
    const askRaw = Number(row.askPrice);
    const highRaw = Number(row.highPrice);
    const lowRaw = Number(row.lowPrice);
    const fallback = spec ? buildSymbolInfo(spec) : null;

    const info: SymbolInfo = {
      symbol: sym,
      name: spec?.name ?? `${sym.replace(/USDT$|USDC$|BUSD$/, '')} / TetherUS`,
      exchange: spec?.exchange ?? 'BINANCE',
      assetClass: 'crypto',
      last,
      change: Number.isFinite(changeRaw) ? roundTo(changeRaw, precision) : 0,
      changePercent: Number.isFinite(changePctRaw) ? roundTo(changePctRaw, 2) : 0,
      volume: Number.isFinite(volRaw) && volRaw > 0 ? Math.round(volRaw) : fallback?.volume ?? 1,
      avgVolume30d: fallback?.avgVolume30d ?? (Number.isFinite(volRaw) ? Math.round(volRaw) : 1),
      marketCap: spec?.marketCap,
      sector: spec?.sector ?? 'Cryptocurrency',
      currency: spec?.currency ?? 'USDT',
      marketOpen: true,
      bid: Number.isFinite(bidRaw) && bidRaw > 0 ? roundTo(bidRaw, precision) : undefined,
      ask: Number.isFinite(askRaw) && askRaw > 0 ? roundTo(askRaw, precision) : undefined,
      dayHigh: Number.isFinite(highRaw) && highRaw > 0 ? roundTo(highRaw, precision) : undefined,
      dayLow: Number.isFinite(lowRaw) && lowRaw > 0 ? roundTo(lowRaw, precision) : undefined,
      dataSource: 'live',
      updatedAt: nowIso,
    };

    setCachedLiveQuote(sym, info);
    result.set(sym, info);
  }
  return result;
}

async function fetchLiveSymbolInfo(
  rawSymbol: string,
  bypassCache = false,
): Promise<SymbolInfo | null> {
  const canonical = resolveSymbol(rawSymbol) ?? isDynamicTickerCandidate(rawSymbol);
  if (!canonical) return null;

  if (!bypassCache) {
    const cached = getCachedLiveQuote(canonical);
    if (cached) return cached;
  }

  const spec = SPEC_BY_SYMBOL.get(canonical);
  if (spec?.assetClass === 'crypto' || (!spec && isCryptoPairTicker(canonical))) {
    try {
      const map = await fetchBinance24hTickers([canonical]);
      const info = map.get(canonical);
      if (info) return info;
    } catch {
      return null;
    }
    return null;
  }

  const yahooSym = spec?.yahooSymbol ?? canonical;
  try {
    const { bars, meta } = await fetchYahooChartWithMeta(
      yahooSym,
      '1D',
      30,
      spec?.precision,
    );
    const info = buildLiveSymbolInfoFromYahoo(canonical, meta, bars, spec);
    if (info) {
      setCachedLiveQuote(canonical, info);
      return info;
    }
  } catch {
    return null;
  }
  return null;
}

async function searchYahooSymbols(
  query: string,
  assetClass: AssetClass | 'all',
): Promise<SymbolInfo[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const cacheKey = `${trimmed.toLowerCase()}:${assetClass}`;
  const cached = liveSearchCache.get(cacheKey);
  if (cached && Date.now() <= cached.expiresAt) {
    return cached.symbols;
  }

  try {
    const res = await fetchYahooJson(
      `/v1/finance/search?q=${encodeURIComponent(trimmed)}&quotesCount=8&newsCount=0`,
    );
    if (!res.ok) return [];
    const payload = (await res.json()) as YahooSearchPayload;
    const quotes = Array.isArray(payload.quotes) ? payload.quotes : [];

    const candidates: Array<{
      symbol: string;
      name: string;
      exchange: string;
      assetClass: AssetClass;
    }> = [];

    for (const qItem of quotes) {
      const sym = typeof qItem.symbol === 'string' ? qItem.symbol.trim().toUpperCase() : '';
      const mappedClass = mapYahooQuoteTypeToAssetClass(qItem.quoteType, sym);
      if (!sym || !mappedClass) continue;
      if (assetClass !== 'all' && mappedClass !== assetClass) continue;
      if (resolveSymbol(sym)) continue;
      if (!isDynamicTickerCandidate(sym)) continue;

      candidates.push({
        symbol: sym,
        name: qItem.longname || qItem.shortname || sym,
        exchange: qItem.exchDisp || qItem.exchange || 'NASDAQ',
        assetClass: mappedClass,
      });
    }

    const hydrated = await Promise.allSettled(
      candidates.slice(0, 5).map(async (c) => {
        const liveInfo = await fetchLiveSymbolInfo(c.symbol);
        if (liveInfo) {
          return {
            ...liveInfo,
            name: liveInfo.name || c.name,
            exchange: liveInfo.exchange || c.exchange,
            assetClass: c.assetClass,
          };
        }
        return {
          symbol: c.symbol,
          name: c.name,
          exchange: c.exchange,
          assetClass: c.assetClass,
          last: 0,
          change: 0,
          changePercent: 0,
          volume: 0,
          avgVolume30d: 0,
          currency: 'USD',
          marketOpen: true,
          dataSource: 'live' as const,
        };
      }),
    );

    const results: SymbolInfo[] = [];
    for (const item of hydrated) {
      if (item.status === 'fulfilled' && item.value.last > 0) {
        results.push(item.value);
      }
    }

    if (liveSearchCache.size >= LIVE_CACHE_MAX_ENTRIES) {
      const oldest = liveSearchCache.keys().next().value;
      if (oldest !== undefined) liveSearchCache.delete(oldest);
    }
    liveSearchCache.set(cacheKey, {
      expiresAt: Date.now() + LIVE_SEARCH_TTL_MS,
      symbols: results,
    });
    return results;
  } catch {
    return [];
  }
}

export async function listSymbolsLive(options?: {
  q?: string;
  assetClass?: AssetClass | 'all';
  live?: boolean;
  bypassCache?: boolean;
}): Promise<MarketSymbolsResponse> {
  const query = options?.q?.trim().toLowerCase() ?? '';
  const assetClass = options?.assetClass ?? 'all';
  const bypassCache = options?.bypassCache === true;
  const useLive =
    options?.live === true ||
    (options?.live === undefined && isLiveMarketEnabledByDefault());

  const baseSpecs = SYMBOL_SPECS.filter((spec) => {
    if (assetClass !== 'all' && spec.assetClass !== assetClass) return false;
    if (!query) return true;
    const aliasMatch = spec.aliases?.some((a) => a.toLowerCase().includes(query)) ?? false;
    return (
      spec.symbol.toLowerCase().includes(query) ||
      spec.name.toLowerCase().includes(query) ||
      spec.exchange.toLowerCase().includes(query) ||
      aliasMatch
    );
  });

  if (!useLive) {
    return {
      symbols: baseSpecs.map(buildSymbolInfo),
      source: 'seeded',
    };
  }

  const cryptoUncached = baseSpecs
    .filter((s) => s.assetClass === 'crypto' && (bypassCache || !getCachedLiveQuote(s.symbol)))
    .map((s) => s.symbol);

  const nonCryptoUncached = baseSpecs.filter(
    (s) => s.assetClass !== 'crypto' && (bypassCache || !getCachedLiveQuote(s.symbol)),
  );

  const batchCryptoPromise =
    cryptoUncached.length > 0
      ? fetchBinance24hTickers(cryptoUncached).catch(() => new Map<string, SymbolInfo>())
      : Promise.resolve(new Map<string, SymbolInfo>());

  const yahooPromises = (async () => {
    const CONCURRENCY = 14;
    for (let i = 0; i < nonCryptoUncached.length; i += CONCURRENCY) {
      const chunk = nonCryptoUncached.slice(i, i + CONCURRENCY);
      await Promise.allSettled(
        chunk.map((spec) => fetchLiveSymbolInfo(spec.symbol, bypassCache)),
      );
    }
  })();

  const searchPromise =
    query.length >= 2
      ? searchYahooSymbols(options?.q ?? '', assetClass)
      : Promise.resolve([]);

  const [cryptoMap, , extraMatches] = await Promise.all([
    batchCryptoPromise,
    yahooPromises,
    searchPromise,
  ]);

  let anyLive = false;
  const catalogResults: SymbolInfo[] = baseSpecs.map((spec) => {
    const hit = cryptoMap.get(spec.symbol) ?? getCachedLiveQuote(spec.symbol);
    if (hit) {
      anyLive = true;
      return hit;
    }
    return buildSymbolInfo(spec);
  });

  const seen = new Set(catalogResults.map((s) => s.symbol));
  const merged = [...catalogResults];
  for (const extra of extraMatches) {
    if (!seen.has(extra.symbol)) {
      seen.add(extra.symbol);
      merged.push(extra);
      anyLive = true;
    }
  }

  return {
    symbols: merged,
    source: anyLive ? 'live' : 'seeded',
  };
}

export async function getSymbolDetailsLive(
  rawSymbol: string,
  options?: { live?: boolean; bypassCache?: boolean },
): Promise<MarketDetailsResponse | null> {
  const useLive =
    options?.live === true ||
    (options?.live === undefined && isLiveMarketEnabledByDefault());

  const canonical = resolveSymbol(rawSymbol);
  if (!useLive) {
    return canonical ? getSymbolDetails(canonical) : null;
  }

  const liveInfo = await fetchLiveSymbolInfo(rawSymbol, options?.bypassCache === true);
  if (liveInfo) {
    return {
      details: liveInfo,
      source: 'live',
    };
  }

  if (canonical) {
    const fallback = getSymbolDetails(canonical);
    return fallback ? { ...fallback, source: 'seeded' } : null;
  }

  return null;
}

export async function getOHLCVBars(options: {
  symbol: string;
  timeframe: Timeframe;
  limit?: number;
  live?: boolean;
  bypassCache?: boolean;
}): Promise<MarketOhlcvResponse> {
  const useLive =
    options.live === true ||
    (options.live === undefined && isLiveMarketEnabledByDefault());

  const canonical = resolveSymbol(options.symbol);
  const dynamicCandidate = !canonical ? isDynamicTickerCandidate(options.symbol) : null;

  if (!canonical && (!useLive || !dynamicCandidate)) {
    throw new UnknownSymbolError(options.symbol);
  }

  const targetSymbol = canonical ?? dynamicCandidate!;
  const spec = canonical ? SPEC_BY_SYMBOL.get(canonical) : undefined;
  if (canonical && !spec) {
    throw new Error(`Missing symbol spec: ${canonical}`);
  }

  const rawLimit = options.limit ?? DEFAULT_OHLCV_LIMIT;
  const safeLimit = Number.isFinite(rawLimit) ? rawLimit : DEFAULT_OHLCV_LIMIT;
  const limit = Math.max(1, Math.min(MAX_SEEDED_BARS, Math.floor(safeLimit)));

  if (useLive) {
    const cacheKey = `${targetSymbol}:${options.timeframe}:${limit}`;
    if (!options.bypassCache) {
      const cached = getCachedLiveBars(cacheKey);
      if (cached) {
        return {
          symbol: targetSymbol,
          timeframe: options.timeframe,
          source: 'live',
          bars: cached,
        };
      }
    }

    try {
      let liveBars: OHLCVBar[] = [];
      if (spec?.assetClass === 'crypto' || (!spec && isCryptoPairTicker(targetSymbol))) {
        liveBars = await fetchBinanceKlines(targetSymbol, options.timeframe, limit);
      } else {
        const yahooSym = spec?.yahooSymbol ?? targetSymbol;
        const fetched = await fetchYahooChartWithMeta(
          yahooSym,
          options.timeframe,
          limit,
          spec?.precision,
        );
        liveBars = fetched.bars;
        if (fetched.meta && liveBars.length > 0 && !getCachedLiveQuote(targetSymbol)) {
          const info = buildLiveSymbolInfoFromYahoo(
            targetSymbol,
            fetched.meta,
            liveBars,
            spec,
          );
          if (info) setCachedLiveQuote(targetSymbol, info);
        }
      }

      if (liveBars.length >= 2) {
        setCachedLiveBars(cacheKey, options.timeframe, liveBars);
        return {
          symbol: targetSymbol,
          timeframe: options.timeframe,
          source: 'live',
          bars: liveBars,
        };
      }
    } catch {
      // Fall through to seeded bars for catalog symbols or UnknownSymbolError for dynamic symbols
    }
  }

  if (!canonical) {
    throw new UnknownSymbolError(options.symbol);
  }

  return {
    symbol: canonical,
    timeframe: options.timeframe,
    source: 'seeded',
    bars: getSeededBars(canonical, options.timeframe, limit),
  };
}

const YAHOO_ULTRA_RANGE_MAP: Record<
  Timeframe,
  { interval: string; range: string; aggregate4h?: boolean }
> = {
  '1m': { interval: '1m', range: '7d' },
  '5m': { interval: '5m', range: '60d' },
  '15m': { interval: '15m', range: '60d' },
  '1h': { interval: '1h', range: '730d' },
  '4h': { interval: '1h', range: '730d', aggregate4h: true },
  '1D': { interval: '1d', range: 'max' },
  '1W': { interval: '1wk', range: 'max' },
  '1M': { interval: '1mo', range: 'max' },
};

async function fetchBinanceKlinesPage(
  symbol: string,
  timeframe: Timeframe,
  limit: number,
  endTimeMs?: number,
): Promise<OHLCVBar[]> {
  const interval = BINANCE_INTERVAL_MAP[timeframe];
  const qs = new URLSearchParams({
    symbol,
    interval,
    limit: String(Math.min(1000, Math.max(1, limit))),
  });
  if (endTimeMs !== undefined && Number.isFinite(endTimeMs) && endTimeMs > 0) {
    qs.set('endTime', String(Math.floor(endTimeMs)));
  }
  const url = `https://data-api.binance.vision/api/v3/klines?${qs.toString()}`;
  const res = await fetchWithTimeout(url);
  if (!res.ok) {
    throw new Error(`Binance HTTP ${res.status}`);
  }
  const data: unknown = await res.json();
  if (!Array.isArray(data)) {
    throw new Error('Unexpected Binance response shape');
  }
  const out: OHLCVBar[] = [];
  for (const row of data) {
    if (!Array.isArray(row) || row.length < 6) continue;
    const time = Math.floor(Number(row[0]) / 1000);
    const open = Number(row[1]);
    const high = Number(row[2]);
    const low = Number(row[3]);
    const close = Number(row[4]);
    const volume = Math.max(1, Math.round(Number(row[5]) || 1));
    if (
      Number.isFinite(time) &&
      Number.isFinite(open) &&
      Number.isFinite(high) &&
      Number.isFinite(low) &&
      Number.isFinite(close) &&
      open > 0 &&
      high > 0 &&
      low > 0 &&
      close > 0
    ) {
      out.push({
        time,
        open,
        high: Math.max(high, open, close),
        low: Math.min(low, open, close),
        close,
        volume,
      });
    }
  }
  return out.sort((a, b) => a.time - b.time);
}

/**
 * Paginates real Binance historical klines backward via `endTime` up to `targetCount`
 * (max 40,000 bars — TradingView Ultra plan depth).
 */
async function fetchBinanceDeepKlines(
  symbol: string,
  timeframe: Timeframe,
  targetCount: number,
  endBeforeSec?: number,
): Promise<OHLCVBar[]> {
  const wanted = Math.min(MAX_ULTRA_BARS, Math.max(100, targetCount));
  const maxPages = Math.min(40, Math.ceil(wanted / 1000));
  const merged = new Map<number, OHLCVBar>();
  let cursorEndMs =
    endBeforeSec !== undefined && Number.isFinite(endBeforeSec)
      ? Math.floor(endBeforeSec * 1000) - 1
      : undefined;

  for (let page = 0; page < maxPages && merged.size < wanted; page += 1) {
    const chunkSize = Math.min(1000, wanted - merged.size);
    const rows = await fetchBinanceKlinesPage(symbol, timeframe, Math.max(500, chunkSize), cursorEndMs);
    if (rows.length === 0) break;
    for (const bar of rows) {
      merged.set(bar.time, bar);
    }
    const earliest = rows[0].time;
    cursorEndMs = earliest * 1000 - 1;
    if (rows.length < 200) break;
  }

  return Array.from(merged.values()).sort((a, b) => a.time - b.time).slice(-wanted);
}

/**
 * Generates deterministic, volatility-matched historical bars backward from `anchorBar`
 * with zero price discontinuity (`lastBackfill.close` seamlessly meets `anchorBar.open`),
 * ensuring TradingView Ultra 40,000-bar depth even on intraday equities/FX where free
 * upstream providers cap intraday lookback to 7–60 days.
 */
function prependDeterministicUltraBackfill(
  existingBars: OHLCVBar[],
  targetTotal: number,
  symbol: string,
  timeframe: Timeframe,
  spec?: SymbolSpec,
): OHLCVBar[] {
  if (existingBars.length >= targetTotal || existingBars.length === 0) {
    return existingBars;
  }
  const needed = targetTotal - existingBars.length;
  const anchor = existingBars[0];
  const stepSec = TIMEFRAME_SECONDS[timeframe];
  const precision = spec?.precision ?? inferPrecision(anchor.open);
  const minPrice = 10 ** -precision;
  const dailyVol = spec?.dailyVol ?? 0.02;
  const tfScale = Math.sqrt(stepSec / 86400);
  const stepVol = Math.min(0.028, Math.max(0.0009, dailyVol * tfScale));
  const avgVol =
    existingBars.slice(0, 60).reduce((s, b) => s + b.volume, 0) /
    Math.max(1, Math.min(60, existingBars.length));

  const rand = mulberry32(fnv1a32(`ultra:${symbol}:${timeframe}:${anchor.time}`));
  const backfill = new Array<OHLCVBar>(needed);
  let nextOpen = anchor.open;

  // Walk backward from anchor.time - stepSec so backfill[needed - 1].close === anchor.open!
  for (let idx = needed - 1; idx >= 0; idx -= 1) {
    const time = anchor.time - (needed - idx) * stepSec;
    const close = Math.max(minPrice, roundTo(nextOpen, precision));
    const wave = Math.sin(idx / 34) * stepVol * 0.22;
    const ret = (rand() + rand() + rand() - 1.5) * 1.1 * stepVol + wave;
    const bounded = Math.max(-0.038, Math.min(0.038, ret));
    const rawOpen = Math.max(minPrice, close / (1 + bounded));
    const open = Math.max(minPrice, roundTo(rawOpen, precision));

    const ref = Math.max(open, close);
    const upWick = (0.08 + rand() * 0.6) * stepVol * ref;
    const dnWick = (0.08 + rand() * 0.6) * stepVol * ref;
    const high = Math.max(open, close, roundTo(Math.max(open, close) + upWick, precision));
    const low = Math.max(minPrice, Math.min(open, close, roundTo(Math.min(open, close) - dnWick, precision)));
    const bodyPct = Math.abs(close - open) / Math.max(open, minPrice);
    const volume = Math.max(1, Math.round(avgVol * (0.5 + rand() * 1.25) * (1 + bodyPct * 7)));

    backfill[idx] = { time, open, high, low, close, volume };
    nextOpen = open;
  }

  return [...backfill, ...existingBars];
}

/**
 * TradingView Ultra Deep History Engine (`GET /api/market/history`):
 * Delivers up to 40,000 historical candles across 1m, 5m, 15m, 1h, 4h, 1D, 1W, 1M
 * with `before` cursor pagination for infinite left-scroll and `fromTime`/`toTime`
 * range slicing for Deep Backtesting.
 */
export async function getUltraOHLCVBars(options: {
  symbol: string;
  timeframe: Timeframe;
  limit?: number;
  before?: number;
  fromTime?: number;
  toTime?: number;
  live?: boolean;
  bypassCache?: boolean;
}): Promise<MarketHistoryResponse> {
  const useLive =
    options.live === true ||
    (options.live === undefined && isLiveMarketEnabledByDefault());

  const canonical = resolveSymbol(options.symbol);
  const dynamicCandidate = !canonical ? isDynamicTickerCandidate(options.symbol) : null;
  if (!canonical && (!useLive || !dynamicCandidate)) {
    throw new UnknownSymbolError(options.symbol);
  }

  const targetSymbol = canonical ?? dynamicCandidate!;
  const spec = canonical ? SPEC_BY_SYMBOL.get(canonical) : undefined;
  const rawLimit = options.limit ?? DEFAULT_ULTRA_LIMIT;
  const limit = Math.max(
    10,
    Math.min(MAX_ULTRA_BARS, Math.floor(Number.isFinite(rawLimit) ? rawLimit : DEFAULT_ULTRA_LIMIT)),
  );

  // Determine how deep the master cached series for this symbol+timeframe needs to be
  const cacheKey = `${targetSymbol}:${options.timeframe}:${useLive ? 'live' : 'sim'}`;
  const existingEntry = !options.bypassCache ? ultraSeriesCache.get(cacheKey) : undefined;
  const nowMs = Date.now();
  const cacheFresh = existingEntry !== undefined && nowMs <= existingEntry.expiresAt;

  // How many total bars do we need in the master series to satisfy `before` or `limit`?
  let requiredDepth = limit;
  if (existingEntry && options.before !== undefined) {
    const olderCount = existingEntry.bars.filter((b) => b.time < options.before!).length;
    if (olderCount < limit) {
      requiredDepth = Math.min(MAX_ULTRA_BARS, existingEntry.bars.length + (limit - olderCount));
    } else {
      requiredDepth = existingEntry.bars.length;
    }
  }

  let masterBars: OHLCVBar[] = [];
  let source: 'seeded' | 'live' | 'ultra_hybrid' = 'seeded';

  if (cacheFresh && existingEntry && existingEntry.bars.length >= requiredDepth) {
    masterBars = existingEntry.bars;
    source = existingEntry.source;
  } else {
    if (useLive) {
      try {
        if (spec?.assetClass === 'crypto' || (!spec && isCryptoPairTicker(targetSymbol))) {
          // If we already have cached live bars and just need older pages before `masterBars[0].time`, page backward!
          if (existingEntry && existingEntry.bars.length > 0 && requiredDepth > existingEntry.bars.length) {
            const extraNeeded = requiredDepth - existingEntry.bars.length;
            const olderPages = await fetchBinanceDeepKlines(
              targetSymbol,
              options.timeframe,
              extraNeeded,
              existingEntry.bars[0].time,
            );
            const dedup = new Map<number, OHLCVBar>();
            for (const b of olderPages) dedup.set(b.time, b);
            for (const b of existingEntry.bars) dedup.set(b.time, b);
            masterBars = Array.from(dedup.values()).sort((a, b) => a.time - b.time);
          } else {
            masterBars = await fetchBinanceDeepKlines(
              targetSymbol,
              options.timeframe,
              requiredDepth,
            );
          }
          if (masterBars.length >= 2) {
            source = 'live';
            if (masterBars.length < requiredDepth) {
              masterBars = prependDeterministicUltraBackfill(
                masterBars,
                requiredDepth,
                targetSymbol,
                options.timeframe,
                spec,
              );
              source = 'ultra_hybrid';
            }
          }
        } else {
          const yahooSym = spec?.yahooSymbol ?? targetSymbol;
          const cfg = YAHOO_ULTRA_RANGE_MAP[options.timeframe];
          const pathAndQuery = `/v8/finance/chart/${encodeURIComponent(
            yahooSym,
          )}?interval=${encodeURIComponent(cfg.interval)}&range=${encodeURIComponent(cfg.range)}`;
          const res = await fetchYahooJson(pathAndQuery);
          if (res.ok) {
            const json = (await res.json()) as YahooChartPayload;
            const result = json.chart?.result?.[0];
            const timestamps = result?.timestamp;
            const quote = result?.indicators?.quote?.[0];
            if (Array.isArray(timestamps) && quote) {
              const precision = spec?.precision ?? inferPrecision(result?.meta?.regularMarketPrice ?? 100);
              const dedup = new Map<number, OHLCVBar>();
              for (let i = 0; i < timestamps.length; i += 1) {
                const t = timestamps[i];
                const o = quote.open?.[i];
                const h = quote.high?.[i];
                const l = quote.low?.[i];
                const c = quote.close?.[i];
                const v = quote.volume?.[i];
                if (
                  typeof t === 'number' &&
                  typeof o === 'number' &&
                  typeof h === 'number' &&
                  typeof l === 'number' &&
                  typeof c === 'number' &&
                  o > 0 &&
                  h > 0 &&
                  l > 0 &&
                  c > 0
                ) {
                  const open = roundTo(o, precision);
                  const close = roundTo(c, precision);
                  dedup.set(t, {
                    time: t,
                    open,
                    high: Math.max(roundTo(h, precision), open, close),
                    low: Math.min(roundTo(l, precision), open, close),
                    close,
                    volume: Math.max(1, Math.round(typeof v === 'number' && Number.isFinite(v) ? v : 1)),
                  });
                }
              }
              let parsed = Array.from(dedup.values()).sort((a, b) => a.time - b.time);
              if (cfg.aggregate4h) parsed = aggregate4hBars(parsed);
              if (parsed.length >= 2) {
                source = 'live';
                if (parsed.length < requiredDepth) {
                  parsed = prependDeterministicUltraBackfill(
                    parsed,
                    requiredDepth,
                    targetSymbol,
                    options.timeframe,
                    spec,
                  );
                  source = 'ultra_hybrid';
                }
                masterBars = parsed.slice(-MAX_ULTRA_BARS);
              }
            }
          }
        }
      } catch {
        // Fall through to deterministic Ultra seeded history
      }
    }

    if (masterBars.length === 0) {
      if (!canonical) {
        throw new UnknownSymbolError(options.symbol);
      }
      const baseSeeded = getSeededBars(canonical, options.timeframe, MAX_SEEDED_BARS);
      masterBars =
        requiredDepth > baseSeeded.length
          ? prependDeterministicUltraBackfill(
              baseSeeded,
              requiredDepth,
              canonical,
              options.timeframe,
              spec,
            )
          : baseSeeded;
      source = 'seeded';
    }

    ultraSeriesCache.set(cacheKey, {
      expiresAt: Date.now() + 25_000,
      source,
      bars: masterBars,
    });
  }

  let sliced = masterBars;
  if (options.before !== undefined && Number.isFinite(options.before)) {
    sliced = sliced.filter((b) => b.time < options.before!);
  }
  if (options.fromTime !== undefined && Number.isFinite(options.fromTime)) {
    sliced = sliced.filter((b) => b.time >= options.fromTime!);
  }
  if (options.toTime !== undefined && Number.isFinite(options.toTime)) {
    sliced = sliced.filter((b) => b.time <= options.toTime!);
  }

  const bars = sliced.slice(-limit);
  const hasMoreBefore = masterBars.length < MAX_ULTRA_BARS || (bars.length > 0 && bars[0].time > masterBars[0].time);

  return {
    symbol: targetSymbol,
    timeframe: options.timeframe,
    source,
    bars,
    totalBars: bars.length,
    earliestTime: bars[0]?.time ?? null,
    latestTime: bars[bars.length - 1]?.time ?? null,
    hasMoreBefore,
  };
}
