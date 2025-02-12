import { Cache, CACHE_MANAGER } from '@nestjs/cache-manager';
import {
  BadRequestException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { envVariablesKeys } from 'src/common/const/env.const';
import { Role, User } from 'src/user/entities/user.entity';
import { UserService } from 'src/user/user.service';
import { Repository } from 'typeorm';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly userService: UserService,
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
    @Inject(CACHE_MANAGER)
    private readonly cacheManager: Cache,
  ) {}

  async tokenBlock(token: string) {
    const payload = await this.jwtService.decode(token);

    // payload['exp'] epoch time seconds
    const expiryDate = +new Date(payload['exp'] * 1000);
    const now = +Date.now();

    const differenceInSeconds = (expiryDate - now) / 1000;

    await this.cacheManager.set(
      `BLOCK_TOKEN_${token}`,
      payload,
      Math.max(differenceInSeconds * 1000, 1),
    );

    return true;
  }

  parseBasicToken(rawToken: string) {
    // 1) 토큰을 ' ' 기준으로 분리
    // ['Basic', $token]
    const basicSplit = rawToken?.split(' ');

    if (basicSplit?.length !== 2)
      throw new BadRequestException('토큰 포맷이 잘못됐습니다!');

    const [basic, token] = basicSplit;

    if (basic.toLowerCase() !== 'basic')
      throw new BadRequestException('토큰 포맷이 잘못됐습니다!');

    // 2) 추출한 토큰을 base64 디코딩해서 이메일과 비밀번호로 나눈다.
    const decoded = Buffer.from(token, 'base64').toString('utf-8');

    // email:password
    const tokenSplit = decoded?.split(':');

    if (tokenSplit.length !== 2)
      throw new BadRequestException('토큰 포맷이 잘못됐습니다!');

    const [email, password] = tokenSplit;

    return { email, password };
  }

  async parseBearerToken(rawToken: string, isRefresh: boolean) {
    const bearerSplit = rawToken?.split(' ');

    if (bearerSplit.length !== 2)
      throw new BadRequestException('토큰 포맷이 잘못됐습니다!');

    const [bearer, token] = bearerSplit;

    if (bearer.toLowerCase() !== 'bearer')
      throw new BadRequestException('토큰 포맷이 잘못됐습니다!');

    try {
      const payload = await this.jwtService.verifyAsync(token, {
        secret: this.configService.get<string>(
          isRefresh
            ? envVariablesKeys.refreshTokenSecret
            : envVariablesKeys.accessTokenSecret,
        ),
      });

      if (isRefresh && payload.type !== 'refresh')
        throw new BadRequestException('Refresh 토큰을 입력해주세요!');
      if (!isRefresh && payload.type !== 'access')
        throw new BadRequestException('Access 토큰을 입력해주세요!');

      return payload;
    } catch (e) {
      throw new UnauthorizedException('토큰이 만료됐습니다!');
    }
  }

  // rawToken : Basic $token
  async register(rawToken: string) {
    const { email, password } = this.parseBasicToken(rawToken);

    return this.userService.create({ email, password });
  }

  async authenticate(email: string, password: string) {
    const user = await this.userRepository.findOne({ where: { email } });

    if (!user) throw new BadRequestException('잘못된 로그인 정보입니다!');

    const passOk = await bcrypt.compare(password, user.password);

    if (!passOk) throw new BadRequestException('잘못된 로그인 정보입니다!');

    return user;
  }

  async issueToken(user: { id: number; role: Role }, isRefresh: boolean) {
    const refreshTokenSecret = this.configService.get<string>(
      envVariablesKeys.refreshTokenSecret,
    );
    const accessTokenSecret = this.configService.get<string>(
      envVariablesKeys.accessTokenSecret,
    );

    return this.jwtService.signAsync(
      { sub: user.id, role: user.role, type: isRefresh ? 'refresh' : 'access' },
      {
        secret: isRefresh ? refreshTokenSecret : accessTokenSecret,
        expiresIn: isRefresh ? '24h' : 300,
      },
    );
  }

  async login(rawToken: string) {
    const { email, password } = this.parseBasicToken(rawToken);

    const user = await this.authenticate(email, password);

    return {
      refreshToken: await this.issueToken(user, true),
      accessToken: await this.issueToken(user, false),
    };
  }
}
