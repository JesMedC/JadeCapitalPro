import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';

import { User } from './entities/user.entity';
import { Role } from './entities/role.entity';
import { UserRole } from './entities/user-role.entity';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { UserPayload } from './strategies/jwt.strategy';

interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Role)
    private readonly roleRepository: Repository<Role>,
    @InjectRepository(UserRole)
    private readonly userRoleRepository: Repository<UserRole>,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async register(dto: RegisterDto): Promise<TokenPair> {
    const existingUser = await this.userRepository.findOne({
      where: [{ email: dto.email }, { username: dto.username }],
    });

    if (existingUser) {
      throw new ConflictException('Email or username already exists');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);

    const user = this.userRepository.create({
      username: dto.username,
      email: dto.email.toLowerCase(),
      passwordHash,
      displayName: dto.username,
    });

    const savedUser = await this.userRepository.save(user);

    // Assign default role via query builder to avoid composite PK issues
    const defaultRole = await this.getOrCreateDefaultRole();
    await this.userRoleRepository
      .createQueryBuilder()
      .insert()
      .into(UserRole)
      .values({ userId: savedUser.id, roleId: Number(defaultRole.id) })
      .orIgnore()
      .execute();

    this.logger.log(`User registered: ${savedUser.email}`);
    return this.generateTokens(savedUser);
  }

  async login(dto: LoginDto): Promise<TokenPair> {
    const user = await this.userRepository.findOne({
      where: { email: dto.email.toLowerCase() },
      select: ['id', 'email', 'username', 'passwordHash', 'isActive'],
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Account is deactivated');
    }

    const isPasswordValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    this.logger.log(`User logged in: ${user.email}`);
    return this.generateTokens(user);
  }

  async refreshToken(refreshToken: string): Promise<TokenPair> {
    try {
      const payload = this.jwtService.verify<UserPayload>(refreshToken, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET', 'change-me-refresh'),
      });

      const user = await this.userRepository.findOne({
        where: { id: payload.sub, isActive: true },
      });

      if (!user) {
        throw new UnauthorizedException('User not found');
      }

      return this.generateTokens(user);
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  async getProfile(userId: string): Promise<User> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return user;
  }

  private async generateTokens(user: User): Promise<TokenPair> {
    const roles = await this.getUserRoles(user.id);

    const payload: UserPayload = {
      sub: user.id,
      email: user.email,
      username: user.username,
      roles,
    };

    const accessToken = this.jwtService.sign(payload, {
      expiresIn: this.configService.get<string>('JWT_EXPIRES_IN', '15m'),
    });

    const refreshToken = this.jwtService.sign(payload, {
      secret: this.configService.get<string>('JWT_REFRESH_SECRET', 'change-me-refresh'),
      expiresIn: this.configService.get<string>('JWT_REFRESH_EXPIRES_IN', '7d'),
    });

    return { accessToken, refreshToken };
  }

  private async getUserRoles(userId: string): Promise<string[]> {
    const userRoles = await this.userRoleRepository.find({
      where: { userId },
      relations: ['role'],
    });

    return userRoles.map((ur) => ur.role.name);
  }

  private async getOrCreateDefaultRole(): Promise<Role> {
    let role = await this.roleRepository.findOne({
      where: { name: 'trader' },
    });

    if (!role) {
      role = this.roleRepository.create({ name: 'user' });
      role = await this.roleRepository.save(role);
    }

    return role;
  }
}
