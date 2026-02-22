from sqlmodel import Session, select
from app.db.db import engine
from app.models.trading import User, UserRole
from app.core.security import get_password_hash

def seed_admin():
    with Session(engine) as session:
        # Check if admin already exists
        statement = select(User).where(User.username == "admin")
        results = session.exec(statement)
        user = results.first()
        
        if not user:
            print("Creating admin user...")
            admin_user = User(
                username="admin",
                email="admin@jadecapital.pro",
                password_hash=get_password_hash("admin"),
                role=UserRole.ADMIN
            )
            session.add(admin_user)
            session.commit()
            print("Admin user created successfully!")
        else:
            print("Admin user already exists.")

if __name__ == "__main__":
    seed_admin()
