import pandas as pd
import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.preprocessing import LabelEncoder
from typing import List, Dict
import joblib
import os

class JadeLearningModule:
    """
    Red Neuronal / Módulo de Machine Learning para aprendizaje continuo.
    Evalúa patrones y predice la probabilidad de éxito de una señal.
    """
    
    def __init__(self, model_path: str = "backend/app/ai/models/jade_v1.pkl"):
        self.model_path = model_path
        self.model = None
        self.le_instrument = LabelEncoder()
        self.le_session = LabelEncoder()
        
        if os.path.exists(self.model_path):
            self.load_model()
        else:
            self.model = RandomForestClassifier(n_estimators=100, random_state=42)

    def load_model(self):
        try:
            self.model = joblib.load(self.model_path)
        except:
            self.model = RandomForestClassifier(n_estimators=100, random_state=42)

    def save_model(self):
        os.makedirs(os.path.dirname(self.model_path), exist_ok=True)
        joblib.dump(self.model, self.model_path)

    def prepare_data(self, trades: List[Dict]):
        """Convierte los trades de la BD en un DataFrame para entrenamiento."""
        df = pd.DataFrame(trades)
        if df.empty:
            return None, None
            
        # Feature Engineering sencillo
        df['target'] = (df['status'] == 'win').astype(int)
        
        # Encoders
        df['instrument_enc'] = self.le_instrument.fit_transform(df['instrument'])
        df['session_enc'] = df['session_id'] # Ya es numérico
        
        X = df[['instrument_enc', 'session_enc', 'investment']]
        y = df['target']
        
        return X, y

    def train(self, historical_trades: List[Dict]):
        """Re-entrena el modelo con los datos históricos reales del usuario."""
        X, y = self.prepare_data(historical_trades)
        if X is not None and len(X) > 10:
            self.model.fit(X, y)
            self.save_model()
            return True
        return False

    def predict_success_rate(self, instrument: str, session_id: int, investment: float) -> float:
        """Predice la probabilidad de éxito (0.0 a 1.0) para una nueva señal."""
        try:
            # Para la predicción necesitamos que el encoder conozca el instrumento
            instr_enc = self.le_instrument.transform([instrument])[0]
            X_input = np.array([[instr_enc, session_id, investment]])
            
            # Predict probability of class 1 (win)
            prob = self.model.predict_proba(X_input)[0][1]
            return float(prob)
        except:
            # Si el modelo no está entrenado o el instrumento es nuevo, dar probabilidad base
            return 0.5
