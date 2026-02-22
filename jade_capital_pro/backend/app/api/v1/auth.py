from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select
from ...db.db import get_session
from ...models.trading import User, UserRole
from ...core.security import get_password_hash, verify_password, create_access_token
from ...schemas.auth import UserCreate, UserLogin, Token

router = APIRouter(prefix="/auth", tags=["Autenticación"])

@router.post("/register")
def register(user_data: UserCreate, db: Session = Depends(get_session)):
    existing = db.exec(select(User).where(User.username == user_data.username)).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Usuario ya existe")

    new_user = User(
        username=user_data.username,
        email=user_data.email,
        password_hash=get_password_hash(user_data.password),
        role=user_data.role or UserRole.VISOR,
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return {"id": new_user.id, "username": new_user.username, "email": new_user.email, "role": new_user.role}

@router.post("/token", response_model=Token)
def login(data: UserLogin, db: Session = Depends(get_session)):
    user = db.exec(select(User).where(User.username == data.username)).first()
    if not user or not verify_password(data.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Credenciales invalidas")

    access_token = create_access_token(subject=user.username)
    return {"access_token": access_token, "token_type": "bearer"}
