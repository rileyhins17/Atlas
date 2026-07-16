import { Body, Controller, Get, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { LoginInput, RegisterInput, type UserDTO } from '@atlas/shared';
import { ZodValidationPipe } from '../common/zod.pipe.js';
import { AuthService } from './auth.service.js';
import { CurrentUser } from './current-user.decorator.js';
import { SESSION_COOKIE, SessionGuard, type AuthedRequest } from './session.guard.js';
import { AuthedUser } from './auth.service.js';
import { loadEnv } from '../config/env.js';

const THIRTY_DAYS_MS = 1000 * 60 * 60 * 24 * 30;

function setSessionCookie(res: Response, token: string): void {
  const prod = loadEnv().NODE_ENV === 'production';
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: prod,
    path: '/',
    maxAge: THIRTY_DAYS_MS,
  });
}

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  async register(
    @Body(new ZodValidationPipe(RegisterInput)) body: RegisterInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<UserDTO> {
    await this.auth.register(body);
    // Auto-login after registration.
    const { token, user } = await this.auth.login(
      { email: body.email, password: body.password },
      req.headers['user-agent'],
    );
    setSessionCookie(res, token);
    return user;
  }

  @Post('login')
  async login(
    @Body(new ZodValidationPipe(LoginInput)) body: LoginInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<UserDTO> {
    const { token, user } = await this.auth.login(body, req.headers['user-agent']);
    setSessionCookie(res, token);
    return user;
  }

  @Post('logout')
  async logout(
    @Req() req: AuthedRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ ok: true }> {
    const token = req.cookies?.[SESSION_COOKIE];
    if (token) await this.auth.logout(token);
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    return { ok: true };
  }

  @Get('me')
  @UseGuards(SessionGuard)
  me(@CurrentUser() user: AuthedUser): UserDTO {
    return { id: user.id, email: user.email, displayName: user.displayName, timezone: user.timezone };
  }
}
