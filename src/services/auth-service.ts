import * as path from 'path';
import * as fs from 'fs';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { getStorageDir } from '../utils/path-helpers.js';

export interface User {
  id: string;
  username: string;
  passwordHash: string;
  createdAt: string;
}

export interface UserPublic {
  id: string;
  username: string;
  createdAt: string;
}

const JWT_SECRET = process.env.JWT_SECRET || 'roadmap-skill-secret-key-change-in-production';
const JWT_EXPIRES_IN = '7d';

export class AuthService {
  private usersFile: string;

  constructor() {
    const baseDir = path.dirname(getStorageDir());
    this.usersFile = path.join(baseDir, 'users.json');
  }

  private loadUsers(): User[] {
    try {
      if (!fs.existsSync(this.usersFile)) {
        return [];
      }
      const raw = fs.readFileSync(this.usersFile, 'utf-8');
      return JSON.parse(raw);
    } catch {
      return [];
    }
  }

  private saveUsers(users: User[]): void {
    const dir = path.dirname(this.usersFile);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(this.usersFile, JSON.stringify(users, null, 2), 'utf-8');
  }

  async register(username: string, password: string): Promise<{ user: UserPublic; token: string }> {
    const cleanUsername = username.trim();
    if (!cleanUsername || cleanUsername.length < 2) {
      throw new Error('用户名长度至少为 2 个字符');
    }
    if (!password || password.length < 6) {
      throw new Error('密码长度至少为 6 个字符');
    }

    const users = this.loadUsers();
    const existing = users.find(u => u.username.toLowerCase() === cleanUsername.toLowerCase());
    if (existing) {
      throw new Error(`用户名 "${cleanUsername}" 已经存在，请直接登录或换一个用户名`);
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const now = new Date().toISOString();
    const newUser: User = {
      id: `usr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      username: cleanUsername,
      passwordHash,
      createdAt: now,
    };

    users.push(newUser);
    this.saveUsers(users);

    const token = this.generateToken(newUser);
    return {
      user: { id: newUser.id, username: newUser.username, createdAt: newUser.createdAt },
      token,
    };
  }

  async login(username: string, password: string): Promise<{ user: UserPublic; token: string }> {
    const cleanUsername = username.trim();
    const users = this.loadUsers();
    const user = users.find(u => u.username.toLowerCase() === cleanUsername.toLowerCase());

    if (!user) {
      throw new Error('用户不存在，请先注册');
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      throw new Error('密码错误，请重试');
    }

    const token = this.generateToken(user);
    return {
      user: { id: user.id, username: user.username, createdAt: user.createdAt },
      token,
    };
  }

  verifyToken(token: string): UserPublic | null {
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as { id: string; username: string };
      const users = this.loadUsers();
      const user = users.find(u => u.id === decoded.id);
      if (!user) return null;
      return { id: user.id, username: user.username, createdAt: user.createdAt };
    } catch {
      return null;
    }
  }

  private generateToken(user: User): string {
    return jwt.sign(
      { id: user.id, username: user.username },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );
  }
}

export const authService = new AuthService();
