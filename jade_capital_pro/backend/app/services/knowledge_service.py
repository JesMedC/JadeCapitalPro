import os
from PyPDF2 import PdfReader
from typing import List, Dict, Optional
import json

class KnowledgeBaseService:
    """
    Servicio para gestionar el repositorio de manuales y base de conocimiento.
    Extrae texto de PDFs y lo indexa para alimentar al JADE BOT.
    """
    
    def __init__(self, base_path: str = "docs/knowledge_base"):
        self.base_path = base_path
        self.index_path = os.path.join(self.base_path, "index.json")
        os.makedirs(self.base_path, exist_ok=True)
        
        if not os.path.exists(self.index_path):
            self.save_index({})

    def save_index(self, index: Dict):
        with open(self.index_path, 'w', encoding='utf-8') as f:
            json.dump(index, f, indent=4)

    def get_index(self) -> Dict:
        if os.path.exists(self.index_path):
            with open(self.index_path, 'r', encoding='utf-8') as f:
                return json.load(f)
        return {}

    def process_pdf(self, file_path: str, filename: str) -> Optional[Dict[str, object]]:
        """Extrae texto de un PDF y lo añade al índice."""
        try:
            reader = PdfReader(file_path)
            full_text = ""
            for page in reader.pages:
                page_text = page.extract_text() or ""
                full_text += page_text + "\n"
            
            # Guardar el extracto de texto
            text_filename = filename.replace(".pdf", ".txt")
            text_path = os.path.join(self.base_path, text_filename)
            with open(text_path, 'w', encoding='utf-8') as f:
                f.write(full_text)
                
            # Actualizar índice
            index = self.get_index()
            index[filename] = {
                "text_file": text_filename,
                "pages": len(reader.pages),
                "processed_at": str(os.path.getmtime(file_path)),
                "keywords": self.extract_keywords(full_text),
                "enabled": True,
            }
            self.save_index(index)
            
            return index[filename]
        except Exception as e:
            print(f"Error procesando PDF: {e}")
            return None

    def extract_keywords(self, text: str) -> List[str]:
        """Extrae términos de trading clave del texto para alimentar a la IA."""
        keywords_to_find = [
            "Elliott", "Ondas", "Fibonacci", "Impulso", "Corrección", 
            "RSI", "MACD", "Soporte", "Resistencia", "Breakout"
        ]
        found = [k for k in keywords_to_find if k.lower() in text.lower()]
        return list(set(found))

    def get_knowledge_summary(self) -> List[Dict]:
        index = self.get_index()
        return [{"filename": k, **v} for k, v in index.items()]


    def set_enabled(self, filename: str, enabled: bool) -> Dict:
        index = self.get_index()
        if filename not in index:
            raise ValueError("Documento no encontrado")

        index[filename]["enabled"] = bool(enabled)
        self.save_index(index)
        return {"filename": filename, **index[filename]}
