import pandas as pd
import numpy as np
from typing import List, Dict, Optional

class ElliottWaveDetector:
    """
    Motor matemático para la detección de estructuras de Ondas de Elliott.
    Identifica picos, valles y clasifica ondas impulsivas (1-5) y correctivas (ABC).
    """
    
    def __init__(self, pivot_lookback: int = 5):
        self.pivot_lookback = pivot_lookback

    def find_pivots(self, data: pd.DataFrame) -> pd.DataFrame:
        """Identifica máximos y mínimos locales (Fractales)."""
        df = data.copy()
        df['high_pivot'] = False
        df['low_pivot'] = False
        
        for i in range(self.pivot_lookback, len(df) - self.pivot_lookback):
            # Pivot High
            if df['high'].iloc[i] == df['high'].iloc[i-self.pivot_lookback:i+self.pivot_lookback+1].max():
                df.at[df.index[i], 'high_pivot'] = True
            
            # Pivot Low
            if df['low'].iloc[i] == df['low'].iloc[i-self.pivot_lookback:i+self.pivot_lookback+1].min():
                df.at[df.index[i], 'low_pivot'] = True
                
        return df

    def detect_impulse_123(self, pivots: List[Dict]) -> Optional[Dict]:
        """
        Detecta el inicio de una estructura impulsiva (Ondas 1, 2, 3).
        Reglas básicas:
        - Onda 2 no retrocede más del 100% de la Onda 1.
        - Onda 3 suele ser la más larga y nunca la más corta.
        """
        if len(pivots) < 4:
            return None
            
        p0, p1, p2, p3 = pivots[-4:] # Inicio, Fin 1, Fin 2, Fin 3 (proyectado)
        
        # Filtro alcista
        if p1['price'] > p0['price'] and p2['price'] > p0['price'] and p2['price'] < p1['price']:
            # Posible Onda 2 terminada, buscando Onda 3
            wave_1_len = p1['price'] - p0['price']
            wave_2_retracement = (p1['price'] - p2['price']) / wave_1_len
            
            if 0.382 <= wave_2_retracement <= 0.786: # Retrocesos comunes de Fibonacci
                return {
                    "structure": "Impulse 1-2-3",
                    "direction": "BULLISH",
                    "wave_1_end": p1['price'],
                    "wave_2_end": p2['price'],
                    "target_wave_3": p2['price'] + (wave_1_len * 1.618),
                    "confidence": 0.75
                }
        
        return None

    def analyze(self, candles: List[Dict]) -> Dict:
        """Punto de entrada para el análisis de una serie de velas."""
        df = pd.DataFrame(candles)
        if df.empty or len(df) < 20:
            return {"status": "error", "message": "Datos insuficientes"}
            
        df_pivots = self.find_pivots(df)
        
        # Extraer lista de picos/valles para análisis estructural
        pivots_list = []
        for idx, row in df_pivots.iterrows():
            if row['high_pivot']:
                pivots_list.append({"type": "high", "price": row['high'], "index": idx})
            if row['low_pivot']:
                pivots_list.append({"type": "low", "price": row['low'], "index": idx})
                
        structure = self.detect_impulse_123(pivots_list)
        
        if structure:
            return {
                "status": "success",
                "pattern": structure,
                "message": f"Estructura {structure['structure']} detectada"
            }
            
        return {"status": "neutral", "message": "No se detectaron patrones claros"}
