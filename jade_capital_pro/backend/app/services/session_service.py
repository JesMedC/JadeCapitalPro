from datetime import time, datetime

def get_session_id(dt: datetime = None) -> int:
    """
    Clasifica automáticamente una marca de tiempo en una de las 4 sesiones definidas.
    
    1: 02:00 – 08:00
    2: 08:00 – 14:00
    3: 14:00 – 20:00
    4: 20:00 – 02:00
    """
    if dt is None:
        dt = datetime.now()
    
    t = dt.time()
    
    # Session 1: 02:00 - 08:00
    if time(2, 0) <= t < time(8, 0):
        return 1
    # Session 2: 08:00 - 14:00
    elif time(8, 0) <= t < time(14, 0):
        return 2
    # Session 3: 14:00 - 20:00
    elif time(14, 0) <= t < time(20, 0):
        return 3
    # Session 4: 20:00 - 02:00 (Cruza la medianoche)
    else:
        return 4

def get_session_name(session_id: int) -> str:
    names = {
        1: "Madrugada (02-08)",
        2: "Mañana (08-14)",
        3: "Tarde (14-20)",
        4: "Noche (20-02)"
    }
    return names.get(session_id, "Unknown")
