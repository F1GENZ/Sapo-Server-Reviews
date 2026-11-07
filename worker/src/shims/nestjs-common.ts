const reflectObj = Reflect as unknown as Record<string, unknown>;
if (typeof reflectObj.getMetadata !== 'function') {
  reflectObj.getMetadata = () => undefined;
}
if (typeof reflectObj.defineMetadata !== 'function') {
  reflectObj.defineMetadata = () => undefined;
}

export enum HttpStatus {
  OK = 200,
  CREATED = 201,
  ACCEPTED = 202,
  NO_CONTENT = 204,
  FOUND = 302,
  BAD_REQUEST = 400,
  UNAUTHORIZED = 401,
  FORBIDDEN = 403,
  NOT_FOUND = 404,
  CONFLICT = 409,
  GONE = 410,
  PAYLOAD_TOO_LARGE = 413,
  UNSUPPORTED_MEDIA_TYPE = 415,
  UNPROCESSABLE_ENTITY = 422,
  TOO_MANY_REQUESTS = 429,
  INTERNAL_SERVER_ERROR = 500,
  NOT_IMPLEMENTED = 501,
  BAD_GATEWAY = 502,
  SERVICE_UNAVAILABLE = 503,
  GATEWAY_TIMEOUT = 504,
}

export class HttpException extends Error {
  private readonly response: string | Record<string, unknown>;
  private readonly status: number;

  constructor(response: string | Record<string, unknown>, status: number) {
    const msg =
      typeof response === 'string'
        ? response
        : typeof response?.message === 'string'
          ? response.message
          : Array.isArray(response?.message)
            ? response.message.join(', ')
            : 'Http Exception';
    super(msg);
    this.response = response;
    this.status = status;
  }

  getStatus(): number {
    return this.status;
  }

  getResponse(): string | Record<string, unknown> {
    return this.response;
  }
}

const makeNamedHttpException = (defaultStatus: number, defaultError: string) =>
  class extends HttpException {
    constructor(response?: string | Record<string, unknown>, description?: string) {
      if (response && typeof response === 'object' && !Array.isArray(response)) {
        super(
          {
            error: description || defaultError,
            statusCode: defaultStatus,
            ...response,
          },
          defaultStatus,
        );
      } else {
        super(
          {
            message: response ?? defaultError,
            error: description || defaultError,
            statusCode: defaultStatus,
          },
          defaultStatus,
        );
      }
    }
  };

export const BadRequestException = makeNamedHttpException(400, 'Bad Request');
export const UnauthorizedException = makeNamedHttpException(401, 'Unauthorized');
export const ForbiddenException = makeNamedHttpException(403, 'Forbidden');
export const NotFoundException = makeNamedHttpException(404, 'Not Found');
export const ConflictException = makeNamedHttpException(409, 'Conflict');
export const PayloadTooLargeException = makeNamedHttpException(413, 'Payload Too Large');
export const UnsupportedMediaTypeException = makeNamedHttpException(415, 'Unsupported Media Type');
export const InternalServerErrorException = makeNamedHttpException(500, 'Internal Server Error');
export const NotImplementedException = makeNamedHttpException(501, 'Not Implemented');
export const BadGatewayException = makeNamedHttpException(502, 'Bad Gateway');
export const ServiceUnavailableException = makeNamedHttpException(503, 'Service Unavailable');
export const GatewayTimeoutException = makeNamedHttpException(504, 'Gateway Timeout');

export class Logger {
  constructor(private readonly context?: string) {}
  log(_msg: unknown, ..._args: unknown[]): void {}
  warn(_msg: unknown, ..._args: unknown[]): void {}
  error(_msg: unknown, ..._args: unknown[]): void {}
  debug(_msg: unknown, ..._args: unknown[]): void {}
  verbose(_msg: unknown, ..._args: unknown[]): void {}
}

const noopDecorator = (..._args: unknown[]) => (..._targetArgs: unknown[]) => {};

export const Injectable = noopDecorator;
export const Inject = noopDecorator;
export const Optional = noopDecorator;
export const Controller = noopDecorator;
export const Get = noopDecorator;
export const Post = noopDecorator;
export const Put = noopDecorator;
export const Patch = noopDecorator;
export const Delete = noopDecorator;
export const Param = noopDecorator;
export const Query = noopDecorator;
export const Body = noopDecorator;
export const Headers = noopDecorator;
export const Req = noopDecorator;
export const Res = noopDecorator;
export const HttpCode = noopDecorator;
export const UseGuards = noopDecorator;
export const UseInterceptors = noopDecorator;
export const SetMetadata = noopDecorator;
export const Module = noopDecorator;
export const Global = noopDecorator;
export const createParamDecorator = noopDecorator;
export const UploadedFile = noopDecorator;

export class DefaultValuePipe<T = unknown> {
  constructor(private readonly defaultValue: T) {}
  transform(value?: T): T {
    return value ?? this.defaultValue;
  }
}

export class ParseIntPipe {
  constructor(_opts?: unknown) {}
  transform(value: string): number {
    return Number.parseInt(value, 10);
  }
}

export class ValidationPipe {
  constructor(_opts?: unknown) {}
  transform<T = unknown>(value: T): T {
    return value;
  }
}

export interface OnModuleInit {
  onModuleInit(): unknown;
}
export interface OnModuleDestroy {
  onModuleDestroy(): unknown;
}
export interface CanActivate {
  canActivate(context: ExecutionContext): unknown;
}
export interface PipeTransform<T = unknown, R = unknown> {
  transform(value: T, metadata?: unknown): R;
}
export interface NestInterceptor {
  intercept(context: unknown, next: unknown): unknown;
}
export interface ExecutionContext {
  switchToHttp(): {
    getRequest<T = unknown>(): T;
    getResponse<T = unknown>(): T;
  };
  getHandler(): unknown;
  getClass(): unknown;
}
export class Reflector {
  getAllAndOverride<T = unknown>(_metadataKey?: unknown, _targets?: unknown[]): T {
    return undefined as T;
  }
}
export const FileInterceptor = noopDecorator;
export const Type = noopDecorator;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const Transform = (_fn: (params: { value: any; key?: string; obj?: any }) => unknown) => noopDecorator();
export const ArrayMaxSize = noopDecorator;
export const ArrayNotEmpty = noopDecorator;
export const IsArray = noopDecorator;
export const IsBoolean = noopDecorator;
export const IsEmail = noopDecorator;
export const IsIn = noopDecorator;
export const IsInt = noopDecorator;
export const IsNotEmpty = noopDecorator;
export const IsNumber = noopDecorator;
export const IsOptional = noopDecorator;
export const IsPositive = noopDecorator;
export const IsString = noopDecorator;
export const IsUrl = noopDecorator;
export const Length = noopDecorator;
export const Matches = noopDecorator;
export const Max = noopDecorator;
export const MaxLength = noopDecorator;
export const Min = noopDecorator;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const ValidateIf = (_cond: (object: any, value: any) => boolean, _opts?: unknown) => noopDecorator();
export const ValidateNested = noopDecorator;
