import { describe, it, expect, vi, beforeEach } from "vitest";
import bcrypt from "bcryptjs";

// Mock the db module
vi.mock("./db", () => ({
  getDb: vi.fn(),
  getUserByNickname: vi.fn(),
}));

// Mock the sdk module
vi.mock("./_core/sdk", () => ({
  sdk: {
    createSessionToken: vi.fn().mockResolvedValue("mock-jwt-token"),
  },
}));

import { getDb, getUserByNickname } from "./db";
import { registerUser, loginUser, hashPassword, verifyPassword } from "./auth";

describe("auth helpers", () => {
  describe("hashPassword / verifyPassword", () => {
    it("should hash and verify a password correctly", async () => {
      const password = "mySecurePassword123";
      const hash = await hashPassword(password);
      expect(hash).not.toBe(password);
      const valid = await verifyPassword(password, hash);
      expect(valid).toBe(true);
    });

    it("should reject wrong password", async () => {
      const hash = await hashPassword("correctPassword");
      const valid = await verifyPassword("wrongPassword", hash);
      expect(valid).toBe(false);
    });
  });

  describe("registerUser", () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it("should throw EMAIL_ALREADY_EXISTS if email is taken", async () => {
      const mockDb = {
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([{ id: 1, email: "test@test.com" }]),
        insert: vi.fn().mockReturnThis(),
        values: vi.fn().mockResolvedValue(undefined),
      };
      (getDb as any).mockResolvedValue(mockDb);
      (getUserByNickname as any).mockResolvedValue(undefined);

      await expect(
        registerUser({ name: "Test", email: "test@test.com", password: "123456" })
      ).rejects.toThrow("EMAIL_ALREADY_EXISTS");
    });

    it("should throw NICKNAME_ALREADY_EXISTS if nickname is taken", async () => {
      const mockDb = {
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([]),
        insert: vi.fn().mockReturnThis(),
        values: vi.fn().mockResolvedValue(undefined),
      };
      (getDb as any).mockResolvedValue(mockDb);
      (getUserByNickname as any).mockResolvedValue({ id: 77, name: "Test" });

      await expect(
        registerUser({ name: "Test", email: "new@test.com", password: "123456" })
      ).rejects.toThrow("NICKNAME_ALREADY_EXISTS");
    });

    it("should create a new user when email is not taken", async () => {
      const newUser = {
        id: 1,
        openId: "local_123",
        name: "Test User",
        email: "new@test.com",
        passwordHash: "hashedpw",
        loginMethod: "email",
        role: "user",
        inviteCode: "ABC123",
        invitedBy: null,
        inviteCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        lastSignedIn: new Date(),
        avatarUrl: null,
      };
      let callCount = 0;
      const mockDb = {
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) return Promise.resolve([]); // no existing user
          return Promise.resolve([newUser]); // return created user
        }),
        insert: vi.fn().mockReturnThis(),
        values: vi.fn().mockResolvedValue(undefined),
      };
      (getDb as any).mockResolvedValue(mockDb);
      (getUserByNickname as any).mockResolvedValue(undefined);

      const user = await registerUser({ name: "Test User", email: "new@test.com", password: "123456" });
      expect(user).toBeDefined();
      expect(user.email).toBe("new@test.com");
    });
  });

  describe("loginUser", () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it("should throw INVALID_CREDENTIALS if user not found", async () => {
      const mockDb = {
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([]),
      };
      (getDb as any).mockResolvedValue(mockDb);

      await expect(
        loginUser({ email: "notfound@test.com", password: "123456" })
      ).rejects.toThrow("INVALID_CREDENTIALS");
    });

    it("should throw INVALID_CREDENTIALS if password is wrong", async () => {
      const hash = await bcrypt.hash("correctPassword", 10);
      const mockDb = {
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([{
          id: 1,
          openId: "local_123",
          email: "test@test.com",
          passwordHash: hash,
          name: "Test",
        }]),
        update: vi.fn().mockReturnThis(),
        set: vi.fn().mockReturnThis(),
      };
      (getDb as any).mockResolvedValue(mockDb);

      await expect(
        loginUser({ email: "test@test.com", password: "wrongPassword" })
      ).rejects.toThrow("INVALID_CREDENTIALS");
    });

    it("should return user and token on valid credentials", async () => {
      const hash = await bcrypt.hash("correctPassword", 10);
      const mockUser = {
        id: 1,
        openId: "local_123",
        email: "test@test.com",
        passwordHash: hash,
        name: "Test User",
      };
      const mockDb = {
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([mockUser]),
        update: vi.fn().mockReturnThis(),
        set: vi.fn().mockReturnThis(),
      };
      (getDb as any).mockResolvedValue(mockDb);

      const result = await loginUser({ email: "test@test.com", password: "correctPassword" });
      expect(result.user).toBeDefined();
      expect(result.token).toBe("mock-jwt-token");
    });
  });
});
