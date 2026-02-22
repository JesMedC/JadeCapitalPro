from .elliott_waves import ElliottWaveDetector
from .learning_module import JadeLearningModule
from typing import List, Dict
import requests

class JadeBotEngine:
    """
    Cerebro del Bot (Jade Bot). Coordina el análisis técnico de ondas
    con la inteligencia predictiva del módulo de aprendizaje.
    """
    
    def __init__(self):
        self.detector = ElliottWaveDetector()
        self.ai = JadeLearningModule()
        self.telegram_token = None # Configurable vía Admin
        self.chat_id = None

    def process_market_data(self, instrument: str, candles: List[Dict]):
        """Analiza datos de mercado y genera señales si la probabilidad es alta."""
        
        # 1. Análisis Técnico (Ondas de Elliott)
        analysis = self.detector.analyze(candles)
        
        if analysis['status'] == 'success':
            pattern = analysis['pattern']
            session_id = pattern.get('session_id', 1) # Simplificado
            
            # 2. Análisis de IA (Probabilidad)
            success_prob = self.ai.predict_success_rate(
                instrument=instrument,
                session_id=session_id,
                investment=10.0 # Monto base de evaluación
            )
            
            # 3. Decisión de Señal (Umbral de 65% de confianza)
            if success_prob > 0.65:
                signal = {
                    "instrument": instrument,
                    "direction": pattern['direction'],
                    "entry_price": pattern.get('wave_2_end'),
                    "tp": pattern['target_wave_3'],
                    "sl": pattern.get('wave_1_end'),
                    "confidence": success_prob,
                    "pattern": pattern['structure']
                }
                
                # 4. Notificar
                self.send_notification(signal)
                return signal
                
        return None

    def send_notification(self, signal: Dict):
        """Envía la señal a los canales configurados (Telegram/WhatsApp)."""
        msg = (
            f"🎯 **NUEVA SEÑAL JADE BOT**\n\n"
            f"💹 **Instrumento:** {signal['instrument']}\n"
            f"🧭 **Dirección:** {signal['direction']}\n"
            f"📉 **Entrada:** {signal['entry_price']}\n"
            f"✅ **Take Profit:** {signal['tp']}\n"
            f"❌ **Stop Loss:** {signal['sl']}\n"
            f"🧠 **Confianza IA:** {signal['confidence']:.2%}\n"
            f"🌊 **Patrón:** {signal['pattern']}\n"
        )
        
        print(f"NOTIFICACIÓN ENVIADA: {msg}")
        
        # Integración real de Telegram (ejemplo)
        if self.telegram_token and self.chat_id:
            url = f"https://api.telegram.org/bot{self.telegram_token}/sendMessage"
            requests.post(url, json={"chat_id": self.chat_id, "text": msg, "parse_mode": "Markdown"})
